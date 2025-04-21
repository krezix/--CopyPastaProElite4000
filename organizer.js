document.addEventListener('DOMContentLoaded', async () => {
    // Referências aos elementos principais da UI
    const folderListElement = document.getElementById('folderList');
    const uncategorizedListElement = document.getElementById('uncategorizedList');
    const btnSaveChanges = document.getElementById('btnSaveChanges');
    const btnCreateFolder = document.getElementById('btnCreateFolder');
    const btnAddNewSnippet = document.getElementById('btnAddNewSnippet');
    // saveStatusElement removido

    // Referências do Modal
    const editSnippetModal = document.getElementById('editSnippetModal');
    const editSnippetTextarea = document.getElementById('editSnippetTextarea');
    const btnSaveEditSnippet = document.getElementById('btnSaveEditSnippet');
    const btnCancelEditSnippet = document.getElementById('btnCancelEditSnippet');
    let currentEditingSnippetId = null; // Guarda o ID do snippet sendo editado

    // Referências do Modal de Adição (NOVO)
    const addSnippetModal = document.getElementById('addSnippetModal');
    const addSnippetTextarea = document.getElementById('addSnippetTextarea');
    const addSnippetFolderSelect = document.getElementById('addSnippetFolderSelect');
    const btnConfirmAddSnippet = document.getElementById('btnConfirmAddSnippet');
    const btnCancelAddSnippet = document.getElementById('btnCancelAddSnippet');

    // Referência do Container de Toasts
    const toastContainer = document.getElementById('toastContainer');

    let textos = [];
    let pastas = [];
    let hasChanges = false;

    const ORDER_GAP = 1000;

    // --- Função para Mostrar Toasts ---
    function showToast(message, options = {}) {
        const { type = 'info', duration = 3000, actions = [] } = options;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message; // Define a mensagem principal

        // Adiciona botões de ação, se houver (para confirmação)
        if (actions.length > 0) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'toast-actions';
            actions.forEach(action => {
                const button = document.createElement('button');
                button.textContent = action.text;
                button.onclick = () => {
                    action.handler();
                    // Remove o toast ao clicar em um botão de ação
                    removeToast(toast);
                };
                actionsDiv.appendChild(button);
            });
            // Adiciona um span para a mensagem e depois os botões
            const messageSpan = document.createElement('span');
            messageSpan.textContent = message;
            toast.innerHTML = ''; // Limpa o texto inicial
            toast.appendChild(messageSpan);
            toast.appendChild(actionsDiv);
        }

        toastContainer.appendChild(toast);

        // Força reflow para garantir que a transição inicial funcione
        toast.offsetHeight;

        // Adiciona a classe 'show' para iniciar a animação de entrada
        toast.classList.add('show');

        // Remove o toast após a duração (se não for confirmação ou duração infinita)
        if (duration !== null && actions.length === 0) {
            setTimeout(() => {
                removeToast(toast);
            }, duration);
        }
    }

    // Função auxiliar para remover o toast com animação
    function removeToast(toastElement) {
        toastElement.classList.remove('show');
        toastElement.classList.add('hide');
        // Remove o elemento do DOM após a animação de saída
        setTimeout(() => {
            if (toastElement.parentNode === toastContainer) {
                 toastContainer.removeChild(toastElement);
            }
        }, 400); // Deve corresponder à duração da transição CSS
    }


    // --- Carregamento Inicial (sem alterações significativas) ---
    async function loadData() {
        try {
            const data = await chrome.storage.local.get(['textos', 'pastas']);
            textos = data.textos || [];
            pastas = data.pastas || [];
            console.log("Dados carregados:", { textos, pastas });

            let needsSave = assignInitialOrderAndIds();
            if (needsSave) {
                console.warn("IDs ou ordens ausentes. Atribuídos e salvos.");
                await chrome.storage.local.set({ textos, pastas });
            }

            sortDataArrays();
            renderOrganizer();
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            showToast("Erro ao carregar dados!", { type: 'error', duration: 5000 });
        }
    }

    // --- assignInitialOrderAndIds, sortDataArrays (sem alterações) ---
    function assignInitialOrderAndIds() {
        let changed = false;
        let maxOrder = 0;
        pastas = pastas.map((pasta, index) => {
            if (!pasta.id) { pasta.id = `pasta_${Date.now()}_${index}`; changed = true; }
            if (typeof pasta.order !== 'number' || isNaN(pasta.order)) { pasta.order = (index + 1) * ORDER_GAP; changed = true; }
            maxOrder = Math.max(maxOrder, pasta.order);
            return pasta;
        });
        textos = textos.map((item, index) => {
            if (!item.id) { item.id = `snippet_${Date.now()}_${index}`; changed = true; }
            if (typeof item.order !== 'number' || isNaN(item.order)) { item.order = maxOrder + (index + 1) * ORDER_GAP; changed = true; }
            maxOrder = Math.max(maxOrder, item.order);
            return item;
        });
        return changed;
    }
    function sortDataArrays() {
        pastas.sort((a, b) => (a.order || 0) - (b.order || 0));
        textos.sort((a, b) => {
            const pastaA = a.pasta || 'zzz_uncategorized';
            const pastaB = b.pasta || 'zzz_uncategorized';
            if (pastaA < pastaB) return -1;
            if (pastaA > pastaB) return 1;
            return (a.order || 0) - (b.order || 0);
        });
    }

    // --- Renderização (sem alterações significativas, exceto remover saveStatus) ---
    function renderOrganizer() {
        folderListElement.innerHTML = '';
        uncategorizedListElement.innerHTML = '';
        const itemsByFolder = {};
        pastas.forEach(p => itemsByFolder[p.id] = []);
        const uncategorizedItems = [];
        textos.forEach(item => {
            if (item.pasta && pastas.some(p => p.id === item.pasta)) {
                if (!itemsByFolder[item.pasta]) itemsByFolder[item.pasta] = [];
                itemsByFolder[item.pasta].push(item);
            } else {
                if(item.pasta && !pastas.some(p => p.id === item.pasta)) {
                    console.warn(`Item ${item.id} tinha pasta ${item.pasta} inválida. Movido para Sem Pasta.`);
                    item.pasta = null;
                    markChanges();
                }
                uncategorizedItems.push(item);
            }
        });
        for (const folderId in itemsByFolder) { itemsByFolder[folderId].sort((a, b) => (a.order || 0) - (b.order || 0)); }
        uncategorizedItems.sort((a, b) => (a.order || 0) - (b.order || 0));
        pastas.forEach((pasta, index) => {
            const isFirstFolder = index === 0;
            const isLastFolder = index === pastas.length - 1;
            const folderElement = createFolderElement(pasta, isFirstFolder, isLastFolder);
            folderListElement.appendChild(folderElement);
            const snippetListElement = folderElement.querySelector('.snippet-list');
            const itemsInThisFolder = itemsByFolder[pasta.id] || [];
            itemsInThisFolder.forEach((item, itemIndex) => {
                const isFirstSnippet = itemIndex === 0;
                const isLastSnippet = itemIndex === itemsInThisFolder.length - 1;
                const snippetElement = createSnippetElement(item, isFirstSnippet, isLastSnippet);
                snippetListElement.appendChild(snippetElement);
            });
        });
        uncategorizedItems.forEach((item, index) => {
            const isFirstSnippet = index === 0;
            const isLastSnippet = index === uncategorizedItems.length - 1;
            const snippetElement = createSnippetElement(item, isFirstSnippet, isLastSnippet);
            uncategorizedListElement.appendChild(snippetElement);
        });
        console.log("Organizador renderizado.");
        updateSaveChangesButton();
    }

    // --- Criação de Elementos HTML (sem alterações significativas) ---
    function createFolderElement(pasta, isFirst, isLast) {
        const li = document.createElement('li');
        li.className = 'folder';
        li.dataset.folderId = pasta.id;
        const contentDiv = document.createElement('div');
        contentDiv.className = 'folder-content';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name';
        nameSpan.textContent = pasta.nome.replace(/📁/g, '').trim();
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'folder-actions';
        actionsDiv.innerHTML = `
            <button class="move-folder-up" title="Mover para Cima" ${isFirst ? 'disabled' : ''}>⬆️</button>
            <button class="move-folder-down" title="Mover para Baixo" ${isLast ? 'disabled' : ''}>⬇️</button>
            <button class="edit-folder" title="Renomear">✏️</button>
            <button class="delete-folder" title="Excluir">🗑️</button>
        `;
        contentDiv.appendChild(nameSpan);
        contentDiv.appendChild(actionsDiv);
        const snippetList = document.createElement('ul');
        snippetList.className = 'snippet-list';
        li.appendChild(contentDiv);
        li.appendChild(snippetList);
        actionsDiv.querySelector('.edit-folder').addEventListener('click', () => handleEditFolder(pasta.id));
        actionsDiv.querySelector('.delete-folder').addEventListener('click', () => handleDeleteFolder(pasta.id));
        actionsDiv.querySelector('.move-folder-up').addEventListener('click', () => handleReorderItem(pasta.id, 'up'));
        actionsDiv.querySelector('.move-folder-down').addEventListener('click', () => handleReorderItem(pasta.id, 'down'));
        return li;
    }
    function createSnippetElement(item, isFirst, isLast) {
        const li = document.createElement('li');
        li.className = 'snippet';
        li.dataset.snippetId = item.id;
        const textSpan = document.createElement('span');
        textSpan.className = 'snippet-text';
        textSpan.textContent = item.texto.length > 60 ? item.texto.substring(0, 57) + '...' : item.texto;
        textSpan.title = item.texto;
        const moveControlsDiv = document.createElement('div');
        moveControlsDiv.className = 'snippet-move-controls';
        moveControlsDiv.style.display = 'none';
        moveControlsDiv.innerHTML = `
            <select class="move-snippet-select"></select>
            <button class="confirm-move-snippet" title="Confirmar Mover">✔️</button>
            <button class="cancel-move-snippet" title="Cancelar">❌</button>
        `;
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'snippet-actions';
        actionsDiv.innerHTML = `
            <button class="move-snippet-up" title="Mover para Cima" ${isFirst ? 'disabled' : ''}>⬆️</button>
            <button class="move-snippet-down" title="Mover para Baixo" ${isLast ? 'disabled' : ''}>⬇️</button>
            <button class="show-move-options" title="Mover para Pasta">↔️</button>
            <button class="edit-snippet" title="Editar">✏️</button>
            <button class="delete-snippet" title="Excluir">🗑️</button>
        `;
        li.appendChild(textSpan);
        li.appendChild(moveControlsDiv);
        li.appendChild(actionsDiv);
        actionsDiv.querySelector('.edit-snippet').addEventListener('click', () => handleEditSnippet(item.id)); // Modificado abaixo
        actionsDiv.querySelector('.delete-snippet').addEventListener('click', () => handleDeleteSnippet(item.id)); // Modificado abaixo
        actionsDiv.querySelector('.show-move-options').addEventListener('click', () => handleShowMoveOptions(item.id, li));
        actionsDiv.querySelector('.move-snippet-up').addEventListener('click', () => handleReorderItem(item.id, 'up'));
        actionsDiv.querySelector('.move-snippet-down').addEventListener('click', () => handleReorderItem(item.id, 'down'));
        moveControlsDiv.querySelector('.confirm-move-snippet').addEventListener('click', () => handleConfirmMoveSnippet(item.id, li));
        moveControlsDiv.querySelector('.cancel-move-snippet').addEventListener('click', () => handleCancelMoveSnippet(li));
        return li;
    }

    // --- Lógica de Mover Snippet (sem alterações) ---
    function handleShowMoveOptions(snippetId, snippetElement) { /* ...código existente... */
        const item = textos.find(t => t.id === snippetId);
        if (!item) return;
        const moveControls = snippetElement.querySelector('.snippet-move-controls');
        const actions = snippetElement.querySelector('.snippet-actions');
        const select = moveControls.querySelector('.move-snippet-select');
        select.innerHTML = `<option value="">--- Sem Pasta ---</option>`;
        pastas.forEach(pasta => {
             const option = document.createElement('option');
             option.value = pasta.id;
             option.textContent = pasta.nome.replace(/📁/g, '').trim(); // Usa replace global
             if (item.pasta === pasta.id) { option.selected = true; }
             select.appendChild(option);
        });
         if (!item.pasta) { select.querySelector('option[value=""]').selected = true; }
        actions.style.display = 'none';
        moveControls.style.display = 'flex';
    }
    function handleCancelMoveSnippet(snippetElement) { /* ...código existente... */
        const moveControls = snippetElement.querySelector('.snippet-move-controls');
        const actions = snippetElement.querySelector('.snippet-actions');
        moveControls.style.display = 'none';
        actions.style.display = 'flex';
    }
    function handleConfirmMoveSnippet(snippetId, snippetElement) { /* ...código existente... */
        const itemIndex = textos.findIndex(t => t.id === snippetId);
        if (itemIndex === -1) return;
        const select = snippetElement.querySelector('.move-snippet-select');
        const newParentId = select.value || null;
        const currentParentId = textos[itemIndex].pasta;
        if (newParentId !== currentParentId) {
            textos[itemIndex].pasta = newParentId;
            const siblingsInNewList = textos.filter(t => t.pasta === newParentId).sort((a, b) => (a.order || 0) - (b.order || 0));
            const lastSiblingOrder = siblingsInNewList.length > 0 ? (siblingsInNewList[siblingsInNewList.length - 1].order || 0) : 0;
            textos[itemIndex].order = lastSiblingOrder + ORDER_GAP;
            console.log(`Snippet ${snippetId} movido para ${newParentId || 'Sem Pasta'} com ordem ${textos[itemIndex].order}`);
            sortDataArrays();
            markChanges();
            renderOrganizer();
        } else {
            handleCancelMoveSnippet(snippetElement);
        }
    }

    // --- Lógica de Reordenar (Up/Down) (sem alterações) ---
    function handleReorderItem(itemId, direction) { /* ...código existente... */
        const isFolder = itemId.startsWith('pasta_');
        const array = isFolder ? pastas : textos;
        const itemIndex = array.findIndex(item => item.id === itemId);
        if (itemIndex === -1) return;
        const currentItem = array[itemIndex];
        const siblings = array.filter(item => isFolder || item.pasta === currentItem.pasta).sort((a, b) => (a.order || 0) - (b.order || 0));
        const siblingIndex = siblings.findIndex(item => item.id === itemId);
        let swapNeighborId = null; // Renomeado para clareza
        if (direction === 'up' && siblingIndex > 0) {
            swapNeighborId = siblings[siblingIndex - 1].id;
        } else if (direction === 'down' && siblingIndex < siblings.length - 1) {
            swapNeighborId = siblings[siblingIndex + 1].id;
        }
        if (swapNeighborId) {
            const neighborIndexInMainArray = array.findIndex(item => item.id === swapNeighborId);
            if (neighborIndexInMainArray !== -1) {
                const neighborOrder = array[neighborIndexInMainArray].order;
                array[neighborIndexInMainArray].order = currentItem.order;
                currentItem.order = neighborOrder;
                console.log(`Item ${itemId} trocou ordem com ${swapNeighborId}`);
                sortDataArrays();
                markChanges();
                renderOrganizer();
            } else { console.error("Erro: Vizinho para troca não encontrado."); }
        } else { console.log(`Não é possível mover ${itemId} ${direction}.`); }
    }

    // --- Ações CRUD (Adaptadas para Modal e Toasts) ---

    function handleCreateFolder() {
        const nome = prompt("Digite o nome da nova pasta:"); // Prompt ainda ok para nome curto
        if (nome && nome.trim()) {
            const nomeLimpo = nome.trim();
            if (pastas.some(p => p.nome.replace(/📁/g, '').trim().toLowerCase() === nomeLimpo.toLowerCase())) {
                // alert("Já existe uma pasta com esse nome."); // Substituído
                showToast("Já existe uma pasta com esse nome.", { type: 'warning' });
                return;
            }
            const lastOrder = pastas.length > 0 ? (pastas[pastas.length - 1].order || 0) : 0;
            const newOrder = lastOrder + ORDER_GAP;
            const newFolder = {
                id: `pasta_${Date.now()}_${nomeLimpo.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 15)}`,
                nome: `📁 ${nomeLimpo}`,
                order: newOrder
            };
            pastas.push(newFolder);
            console.log("Nova pasta criada:", newFolder);
            showToast(`Pasta "${nomeLimpo}" criada.`, { type: 'success' });
            sortDataArrays();
            markChanges();
            renderOrganizer();
        }
    }

    function handleEditFolder(folderId) {
        const folderIndex = pastas.findIndex(p => p.id === folderId);
        if (folderIndex === -1) return;
        const nomeAtual = pastas[folderIndex].nome.replace(/📁/g, '').trim();
        const novoNome = prompt(`Renomear pasta "${nomeAtual}":`, nomeAtual); // Prompt ok aqui
        if (novoNome && novoNome.trim() && novoNome.trim() !== nomeAtual) {
            const nomeLimpo = novoNome.trim();
            if (pastas.some((p, idx) => idx !== folderIndex && p.nome.replace(/📁/g, '').trim().toLowerCase() === nomeLimpo.toLowerCase())) {
                // alert("Já existe outra pasta com esse nome."); // Substituído
                showToast("Já existe outra pasta com esse nome.", { type: 'warning' });
                return;
            }
            pastas[folderIndex].nome = `📁 ${nomeLimpo}`;
            console.log(`Pasta ${folderId} renomeada para: ${pastas[folderIndex].nome}`);
            showToast(`Pasta renomeada para "${nomeLimpo}".`, { type: 'success' });
            markChanges();
            renderOrganizer();
        }
    }

    function handleDeleteFolder(folderId) {
        const folderIndex = pastas.findIndex(p => p.id === folderId);
        if (folderIndex === -1) return;
        const nomePasta = pastas[folderIndex].nome.replace(/📁/g, '').trim();
        const itemsInFolder = textos.filter(item => item.pasta === folderId).length;

        let confirmationMessage = `Excluir pasta "${nomePasta}"?`;
        if (itemsInFolder > 0) {
            confirmationMessage += ` ${itemsInFolder} item(ns) ficarão sem pasta.`;
        }

        // Usa toast de confirmação
        showToast(confirmationMessage, {
            type: 'confirm',
            duration: null, // Não desaparece sozinho
            actions: [
                {
                    text: 'Cancelar',
                    handler: () => { console.log("Exclusão de pasta cancelada."); }
                },
                {
                    text: 'Confirmar',
                    handler: () => {
                        // Lógica de exclusão movida para cá
                        pastas.splice(folderIndex, 1);
                        const uncategorizedSiblings = textos.filter(item => !item.pasta || item.pasta === folderId)
                                                           .sort((a, b) => (a.order || 0) - (b.order || 0));
                        let lastUncategorizedOrder = uncategorizedSiblings.length > 0 ? (uncategorizedSiblings[uncategorizedSiblings.length - 1].order || 0) : 0;
                        textos = textos.map(item => {
                            if (item.pasta === folderId) {
                                item.pasta = null;
                                lastUncategorizedOrder += ORDER_GAP;
                                item.order = lastUncategorizedOrder;
                            }
                            return item;
                        });
                        console.log(`Pasta ${folderId} excluída e ${itemsInFolder} itens movidos para Sem Pasta.`);
                        showToast(`Pasta "${nomePasta}" excluída.`, { type: 'success' });
                        sortDataArrays();
                        markChanges();
                        renderOrganizer();
                    }
                }
            ]
        });
    }

    // --- MODIFICADO: Usa o Modal para Editar Snippet ---
    function handleEditSnippet(snippetId) {
        const itemIndex = textos.findIndex(item => item.id === snippetId);
        if (itemIndex === -1) return;

        currentEditingSnippetId = snippetId; // Guarda o ID
        const textoAtual = textos[itemIndex].texto;

        editSnippetTextarea.value = textoAtual; // Preenche o textarea
        editSnippetModal.style.display = 'flex'; // Mostra o modal
        editSnippetTextarea.focus(); // Foca no textarea
    }

    // --- NOVO: Handler para o botão Salvar do Modal ---
    btnSaveEditSnippet.addEventListener('click', () => {
        if (!currentEditingSnippetId) return;

        const itemIndex = textos.findIndex(item => item.id === currentEditingSnippetId);
        if (itemIndex === -1) {
             console.error("Erro: Snippet ID para edição não encontrado.");
             closeEditModal();
             return;
        }

        const textoAtual = textos[itemIndex].texto;
        const novoTexto = editSnippetTextarea.value.trim(); // Pega valor do textarea

        if (novoTexto !== textoAtual) {
            textos[itemIndex].texto = novoTexto;
            console.log(`Item ${currentEditingSnippetId} editado.`);
            showToast("Item atualizado.", { type: 'success' });
            markChanges();
            renderOrganizer(); // Re-renderiza para mostrar mudança (mesmo que truncada)
        } else {
             console.log("Nenhuma alteração detectada no texto do snippet.");
        }
        closeEditModal();
    });

    // --- NOVO: Handler para o botão Cancelar do Modal ---
    btnCancelEditSnippet.addEventListener('click', () => {
        closeEditModal();
    });

    // --- NOVO: Função para fechar o modal de edição ---
    function closeEditModal() {
        editSnippetModal.style.display = 'none';
        editSnippetTextarea.value = ''; // Limpa o textarea
        currentEditingSnippetId = null; // Limpa o ID guardado
    }


    // --- NOVO: Funções do Modal de Adição ---
    function openAddSnippetModal() {
        // Limpa o textarea e reseta o select
        addSnippetTextarea.value = '';
        addSnippetFolderSelect.innerHTML = '<option value="">--- Sem Pasta ---</option>'; // Opção padrão

        // Preenche o select com as pastas atuais
        pastas.forEach(pasta => {
            const option = document.createElement('option');
            option.value = pasta.id;
            option.textContent = pasta.nome.replace(/📁/g, '').trim();
            addSnippetFolderSelect.appendChild(option);
        });

        addSnippetModal.style.display = 'flex'; // Mostra o modal
        addSnippetTextarea.focus(); // Foca no textarea
    }

    function closeAddSnippetModal() {
        addSnippetModal.style.display = 'none';
        addSnippetTextarea.value = ''; // Limpa por segurança
        addSnippetFolderSelect.value = ''; // Reseta seleção
    }

    // --- NOVO: Handler para o botão "Adicionar Item" do Modal ---
    btnConfirmAddSnippet.addEventListener('click', () => {
        const texto = addSnippetTextarea.value.trim();
        const pastaId = addSnippetFolderSelect.value || null; // null se "Sem Pasta" for selecionado

        if (!texto) {
            showToast("O texto do item não pode estar vazio.", { type: 'warning' });
            addSnippetTextarea.focus();
            return;
        }

        // Calcula a ordem para colocar no final da lista correta
        const siblings = textos.filter(t => t.pasta === pastaId).sort((a, b) => (a.order || 0) - (b.order || 0));
        const lastSiblingOrder = siblings.length > 0 ? (siblings[siblings.length - 1].order || 0) : 0;
        const newOrder = lastSiblingOrder + ORDER_GAP;

        // Cria o novo objeto de snippet
        const newItem = {
            id: `snippet_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, // ID único
            texto: texto,
            pasta: pastaId,
            order: newOrder
        };

        // Adiciona ao array
        textos.push(newItem);
        console.log("Novo item adicionado:", newItem);

        // Atualiza estado e UI
        sortDataArrays();
        markChanges();
        showToast("Novo item adicionado com sucesso!", { type: 'success' });
        closeAddSnippetModal();
        renderOrganizer();
    });

    // --- NOVO: Listener para o botão Cancelar do Modal de Adição ---
    btnCancelAddSnippet.addEventListener('click', () => {
        closeAddSnippetModal();
    });




    // --- MODIFICADO: Usa Toast para confirmar Delete Snippet ---
    function handleDeleteSnippet(snippetId) {
        const itemIndex = textos.findIndex(item => item.id === snippetId);
        if (itemIndex === -1) return;
        const textoItem = textos[itemIndex].texto.substring(0, 30) + (textos[itemIndex].texto.length > 30 ? '...' : '');

        // Usa toast de confirmação
        showToast(`Excluir item "${textoItem}"?`, {
            type: 'confirm',
            duration: null,
            actions: [
                {
                    text: 'Cancelar',
                    handler: () => { console.log("Exclusão de item cancelada."); }
                },
                {
                    text: 'Confirmar',
                    handler: () => {
                        // Lógica de exclusão movida para cá
                        const deletedText = textos[itemIndex].texto.substring(0, 30) + '...'; // Pega antes de deletar
                        textos.splice(itemIndex, 1);
                        console.log(`Item ${snippetId} excluído.`);
                        showToast(`Item "${deletedText}" excluído.`, { type: 'success' });
                        markChanges();
                        renderOrganizer();
                    }
                }
            ]
        });
    }

    // --- Salvar Alterações (Usa Toasts para feedback) ---
    async function saveChanges() {
        if (!hasChanges) return;

        btnSaveChanges.disabled = true;
        btnSaveChanges.textContent = 'Salvando...';
        // saveStatusElement removido

        try {
            sortDataArrays();
            await chrome.storage.local.set({ textos, pastas });
            hasChanges = false;
            btnSaveChanges.textContent = '💾 Salvar Alterações';
            showToast('Alterações salvas com sucesso!', { type: 'success' }); // Feedback com Toast
            console.log("Alterações salvas no storage.");

            chrome.runtime.sendMessage({ acao: "recriarMenu" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Erro ao enviar mensagem 'recriarMenu':", chrome.runtime.lastError);
                    showToast("Erro ao atualizar menu rápido.", { type: 'warning' });
                } else {
                    console.log("Mensagem 'recriarMenu' enviada.", response);
                }
            });

            // Não precisa mais limpar o saveStatusElement

        } catch (error) {
            console.error("Erro ao salvar alterações:", error);
            btnSaveChanges.disabled = false;
            btnSaveChanges.textContent = '💾 Salvar Alterações';
            showToast('Erro ao salvar alterações!', { type: 'error', duration: 5000 }); // Feedback com Toast
        }
    }

    // --- markChanges e updateSaveChangesButton (sem alterações significativas) ---
    function markChanges() {
        hasChanges = true;
        updateSaveChangesButton();
        // saveStatusElement removido
    }
    function updateSaveChangesButton() {
        btnSaveChanges.disabled = !hasChanges;
    }

    // --- Event Listeners dos Botões Principais ---
    btnSaveChanges.addEventListener('click', saveChanges);
    btnCreateFolder.addEventListener('click', handleCreateFolder);
    btnAddNewSnippet.addEventListener('click', openAddSnippetModal); // Abre o modal de adição
    // --- Carrega os dados iniciais ---
    loadData();

}); // Fim do DOMContentLoaded
