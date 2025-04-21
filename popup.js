// Variáveis globais
let textos = [];
let pastas = [];
let config = { // Objeto para configurações
    enableNumbering: false // Padrão: numeração desligada
};

// --- Funções de Backup/Import (sem alterações) ---
async function exportarConfiguracoes() {
    try {
        const { textos, pastas, config: savedConfig } = await chrome.storage.local.get(['textos', 'pastas', 'config']);

        const dadosExportacao = {
            versao: '1.1', // Versão incrementada para incluir config
            dataExportacao: new Date().toISOString(),
            dados: {
                textos: textos || [],
                pastas: pastas || [],
                config: savedConfig || config // Exporta config salva ou padrão
            }
        };

        const dadosString = JSON.stringify(dadosExportacao, null, 2);
        const blob = new Blob([dadosString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dataAtual = new Date().toISOString().split('T')[0];
        const a = document.createElement('a');
        a.href = url;
        a.download = `copypasta_backup_${dataAtual}.json`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 0);

    } catch (error) {
        console.error('Erro ao exportar:', error);
        showToast('Erro ao exportar. Tente novamente.', 'error');
    }
}

async function importarConfiguracoes(arquivo) {
    return new Promise((resolve, reject) => { // Retorna Promise para saber quando terminou
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const texto = e.target.result;
                const dados = JSON.parse(texto);

                if (!dados.versao || !dados.dados) {
                    throw new Error('Formato de arquivo inválido ou faltando seção "dados"');
                }

                // Verifica se textos e pastas existem, mesmo que vazios
                 if (!dados.dados.hasOwnProperty('textos') || !dados.dados.hasOwnProperty('pastas')) {
                     throw new Error('Arquivo JSON não contém "textos" ou "pastas" dentro de "dados"');
                 }


                textos = dados.dados.textos || []; // Usa array vazio se for null/undefined
                pastas = dados.dados.pastas || []; // Usa array vazio se for null/undefined
                config = { ...config, ...(dados.dados.config || {}) }; // Mescla config importada com padrão

                await atualizarStorage(); // Salva tudo

                showToast('Configurações importadas com sucesso!', 'success');
                // Recarrega a extensão para garantir que tudo (popup, background) use os novos dados
                 chrome.runtime.reload();
                 resolve(); // Resolve a promise em caso de sucesso

            } catch (error) {
                console.error('Erro ao importar:', error);
               showToast(`Erro ao importar: ${error.message}. Verifique o arquivo.`, 'error', 5000);
                reject(error); // Rejeita a promise em caso de erro
            }
        };
        reader.onerror = (error) => {
             console.error('Erro ao ler arquivo:', error);
             showToast('Não foi possível ler o arquivo selecionado.', 'error');
             reject(error);
        };
        reader.readAsText(arquivo);
    });
}


// --- Funções Auxiliares Globais ---
async function atualizarStorage() {
    // Garante que config seja sempre um objeto antes de salvar
    config = config || { enableNumbering: false };
    await chrome.storage.local.set({ textos, pastas, config });
    // Pede para recriar o menu APENAS se a ação não foi disparada pela própria recriação
    // (Evita loop caso a recriação falhe e tente salvar de novo)
    // A recriação agora é chamada explicitamente quando necessário (mudança de config, adição, etc.)
    renderizarLista();
    atualizarSelectPastas(); // Atualiza o select de pastas no popup
    // Não chama recriarMenu aqui por padrão, será chamado onde for necessário
}


/**
 * Exibe uma notificação toast.
 * @param {string} message A mensagem a ser exibida.
 * @param {'info' | 'success' | 'warning' | 'error'} type O tipo de toast (afeta a cor). Padrão: 'info'.
 * @param {number} duration Quanto tempo o toast fica visível em milissegundos. Padrão: 3000.
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.error("Elemento #toast-container não encontrado no popup.html!");
        // Fallback para alert se o container não existir
        alert(`[${type.toUpperCase()}] ${message}`);
        return;
    }

    const toast = document.createElement('div');
    // Adiciona a classe base 'toast' e a classe específica do tipo (ex: 'toast-success')
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Força um reflow para garantir que a animação inicial funcione
    toast.offsetHeight; // eslint-disable-line no-unused-expressions

    // Adiciona a classe 'show' para iniciar a animação de entrada
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });


    // Permite fechar o toast clicando nele
    const clickListener = () => {
        toast.classList.remove('show');
        // Espera a animação de saída terminar antes de remover o elemento
        toast.addEventListener('transitionend', () => {
             // Verifica se o toast ainda pertence ao container antes de remover
             if (toast.parentNode === container) {
                 container.removeChild(toast);
             }
        }, { once: true }); // Garante que o listener rode só uma vez
    };
    toast.addEventListener('click', clickListener);


    // Define um temporizador para remover o toast automaticamente
    const timerId = setTimeout(() => {
        // Remove o listener de clique para evitar remover duas vezes se clicado perto do fim
        toast.removeEventListener('click', clickListener);
        clickListener(); // Reutiliza a lógica de remoção do clique
    }, duration);

     // Limpa o timeout se o toast for fechado manualmente pelo clique
     toast.addEventListener('click', () => clearTimeout(timerId), { once: true });
}

function renderizarLista() {
    const lista = document.getElementById("lista");
    lista.innerHTML = "";
    textos.forEach((item, index) => {
        const li = document.createElement("li");
        li.dataset.index = index;

        // Badge da Pasta
        if (item.pasta) {
            const pasta = pastas.find(p => p.id === item.pasta);
            if (pasta) {
                const badge = document.createElement("span");
                badge.className = "folder-badge";
                badge.textContent = pasta.nome.replace(/^📁\s*/, ''); // Remove o emoji de pasta e espaço inicial// Remove ícone inicial se houver
                li.appendChild(badge);
            } else {
                 // Se a pasta não existe mais, mostra um indicativo
                 const badge = document.createElement("span");
                 badge.className = "folder-badge";
                 badge.textContent = "Pasta inválida";
                 badge.style.backgroundColor = "#f15b6c"; // Destaca em vermelho
                 badge.style.color = "white";
                 li.appendChild(badge);
            }
        }

        // Texto do Item
        const textoSpan = document.createElement("span");
        textoSpan.textContent = item.texto;
        textoSpan.className = "item-text";
        li.appendChild(textoSpan);

        // Container de Ações
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "item-actions";

        // Botão Mover para Cima
        const btnUp = document.createElement("button");
        btnUp.textContent = "↑";
        btnUp.title = "Mover para cima";
        btnUp.className = "move-btn up-btn";
        btnUp.disabled = (index === 0);
        btnUp.onclick = () => moverItem(index, -1);
        actionsDiv.appendChild(btnUp);

        // Botão Mover para Baixo
        const btnDown = document.createElement("button");
        btnDown.textContent = "↓";
        btnDown.title = "Mover para baixo";
        btnDown.className = "move-btn down-btn";
        btnDown.disabled = (index === textos.length - 1);
        btnDown.onclick = () => moverItem(index, 1);
        actionsDiv.appendChild(btnDown);

        // Botão Editar
        const btnEdit = document.createElement("button");
        btnEdit.textContent = "✎";
        btnEdit.title = "Editar item";
        btnEdit.className = "edit-btn";
        btnEdit.onclick = (e) => {
             e.stopPropagation(); // Impede que o clique propague para o LI
             iniciarEdicao(li, index);
        }
        actionsDiv.appendChild(btnEdit);

        // Botão Remover
        const btnRemover = document.createElement("button");
        btnRemover.textContent = "x";
        btnRemover.title = "Remover item";
        btnRemover.className = "remove-btn";
        btnRemover.onclick = (e) => {
            e.stopPropagation(); // Impede que o clique propague para o LI
            if (confirm(`Tem certeza que deseja remover o item "${item.texto.substring(0, 30)}..."?`)) {
                 textos.splice(index, 1);
                 atualizarStorage().then(() => {
                    chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Recria menu após remover
                 });
            }
        };
        actionsDiv.appendChild(btnRemover);

        li.appendChild(actionsDiv);
        lista.appendChild(li);
    });
}

async function moverItem(index, direcao) {
    if ((direcao === -1 && index === 0) || (direcao === 1 && index === textos.length - 1)) {
        return;
    }
    const novoIndex = index + direcao;
    [textos[index], textos[novoIndex]] = [textos[novoIndex], textos[index]];
    await atualizarStorage();
    chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Recria menu após mover
}

function iniciarEdicao(listItem, index) {
    // Se já estiver em modo de edição, não faz nada
    if (listItem.querySelector('.edit-controls')) {
        return;
    }

    const item = textos[index];

    // Esconde conteúdo original e ações
    const textoSpan = listItem.querySelector('.item-text');
    const actionsDiv = listItem.querySelector('.item-actions');
    const folderBadge = listItem.querySelector('.folder-badge');
    if (textoSpan) textoSpan.style.display = 'none';
    if (actionsDiv) actionsDiv.style.display = 'none';
    if (folderBadge) folderBadge.style.display = 'none';

    // Cria container para controles de edição
    const editControls = document.createElement('div');
    editControls.className = 'edit-controls';

    // Input para o texto
    const inputTexto = document.createElement('input');
    inputTexto.type = 'text';
    inputTexto.value = item.texto;
    inputTexto.className = 'edit-input-text';
    editControls.appendChild(inputTexto);

    // Select para a pasta
    const selectPasta = document.createElement('select');
    selectPasta.className = 'edit-select-folder';
    selectPasta.innerHTML = '<option value="">-- Sem Pasta --</option>';
    pastas.forEach(pasta => {
        const option = document.createElement('option');
        option.value = pasta.id;
        // Mostra nome da pasta sem ícone no select de edição
         option.textContent = pasta.nome.replace(/^📁\s*/, '');
        if (item.pasta === pasta.id) {
            option.selected = true;
        }
        selectPasta.appendChild(option);
    });
    editControls.appendChild(selectPasta);

    // Container para botões Salvar/Cancelar
    const editButtons = document.createElement('div');
    editButtons.className = 'edit-buttons';

    // Botão Salvar
    const btnSalvar = document.createElement('button');
    btnSalvar.textContent = 'Salvar';
    btnSalvar.className = 'save-btn';
    btnSalvar.onclick = async () => { // Tornar async
        const novoTexto = inputTexto.value.trim();
        const novaPasta = selectPasta.value || null;
        if (novoTexto) {
            textos[index].texto = novoTexto;
            textos[index].pasta = novaPasta;
            await atualizarStorage(); // Salva
            chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Recria menu
            // renderizarLista() será chamado por atualizarStorage
        } else {
            showToast("O texto não pode ficar vazio!", 'warning');
        }
    };
    editButtons.appendChild(btnSalvar);

    // Botão Cancelar
    const btnCancelar = document.createElement('button');
    btnCancelar.textContent = 'Cancelar';
    btnCancelar.className = 'cancel-btn';
    btnCancelar.onclick = () => {
        renderizarLista(); // Apenas re-renderiza para descartar
    };
    editButtons.appendChild(btnCancelar);

    editControls.appendChild(editButtons);
    listItem.prepend(editControls); // Adiciona controles no início do li
    inputTexto.focus(); // Foca no campo de texto
    inputTexto.select(); // Seleciona o texto para fácil substituição
}

function atualizarSelectPastas() {
    const select = document.getElementById("pastaSelect");
    const valorAnterior = select.value; // Guarda valor selecionado
    select.innerHTML = '<option value="">📁 Selecione uma pasta (ou não)</option>';

    pastas.forEach(pasta => {
                // Garante que o nome da pasta tenha o ícone 📁 no select principal
        const nomePasta = pasta.nome.startsWith('📁') ? pasta.nome : `📁 ${pasta.nome}`;
        select.innerHTML += `<option value="${pasta.id}">${nomePasta}</option>`;

    });
    select.innerHTML += '<option value="novaPasta">➕ Criar nova pasta...</option>'; // Ou outro ícone como ✨, ➕ etc.

    // Tenta restaurar o valor anterior, se ainda existir
    if (Array.from(select.options).some(opt => opt.value === valorAnterior)) {
         select.value = valorAnterior;
    }
}

// --- Event Listener Principal ---
document.addEventListener("DOMContentLoaded", async () => {
    // Carregar dados iniciais (incluindo config)
    const dados = await chrome.storage.local.get(["textos", "pastas", "config"]);
    textos = dados.textos || [];
    pastas = dados.pastas || []; // Inicia vazio se não houver pastas salvas
    config = { ...config, ...(dados.config || {}) }; // Mescla config salva


     //  Garantir que todos os itens tenham ID ---
    let precisaSalvarIds = false;
    textos = textos.map(item => {
        if (!item.id) {
            item.id = crypto.randomUUID(); // Gera um ID único
            precisaSalvarIds = true;
            console.log(`ID gerado para item: ${item.id}`);
        }
        return item;
    });

    // Salva de volta SE algum ID foi gerado
    if (precisaSalvarIds) {
        console.log("Salvando textos com novos IDs...");
        await chrome.storage.local.set({ textos }); // Salva apenas os textos atualizados
        // Não precisa recriar menu aqui, só estamos adicionando IDs internos
    }

    // Elementos da UI
    const modeSimple = document.getElementById("btnSimple");
    const modeAdvanced = document.getElementById("btnAdvanced");
    const simpleContainer = document.querySelector(".input-container.simple");
    const advancedContainer = document.querySelector(".input-container.advanced");
    const folderManagement = document.querySelector(".folder-management");
    const btnOrganize = document.getElementById("btnOrganize");
    const chkEnableNumbering = document.getElementById("chkEnableNumbering");

    // --- Controles de Modo (Simples/Avançado) ---
    function toggleMode(mode) {
        if (mode === "simple") {
            modeSimple.classList.add("active");
            modeAdvanced.classList.remove("active");
            simpleContainer.style.display = "block";
            advancedContainer.style.display = "none";
            folderManagement.style.display = "none"; // Esconde gerenciador de pastas
        } else {
            modeSimple.classList.remove("active");
            modeAdvanced.classList.add("active");
            simpleContainer.style.display = "none";
            advancedContainer.style.display = "block";
            // Não mostra folderManagement por padrão ao mudar para avançado
            // Ele só aparece se "Criar nova pasta" for selecionado
             folderManagement.style.display = document.getElementById("pastaSelect").value === 'novaPasta' ? 'block' : 'none';
        }
    }
    modeSimple.addEventListener("click", () => toggleMode("simple"));
    modeAdvanced.addEventListener("click", () => toggleMode("advanced"));

    // --- Botão Organizar ---
    btnOrganize.addEventListener("click", () => {
        chrome.tabs.create({ url: 'organizer.html' });
    });

    // --- Configuração de Numeração ---
    chkEnableNumbering.checked = config.enableNumbering; // Define estado inicial
    chkEnableNumbering.addEventListener('change', async (e) => {
        config.enableNumbering = e.target.checked;
        await chrome.storage.local.set({ config }); // Salva apenas a config
        chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Pede para recriar o menu
        console.log("Configuração de numeração salva:", config.enableNumbering);
    });


    // --- Controles do Separador Customizado ---
    const separatorModeNewline = document.getElementById('separatorModeNewline');
    const separatorModeCustom = document.getElementById('separatorModeCustom');
    const customSeparatorInput = document.getElementById('customSeparatorInput');

    function handleSeparatorModeChange() {
        customSeparatorInput.disabled = !separatorModeCustom.checked;
        if (!separatorModeCustom.checked) {
            customSeparatorInput.value = ';'; // Reseta para o padrão se desabilitar
        }
    }
    separatorModeNewline.addEventListener('change', handleSeparatorModeChange);
    separatorModeCustom.addEventListener('change', handleSeparatorModeChange);
    // Chama uma vez para definir o estado inicial correto do input
    handleSeparatorModeChange();


    // --- Adicionar Item (Modo Simples) ---
    document.getElementById("btnAdicionarSimples").onclick = async () => {
        const input = document.getElementById("novoItemSimples");
        const texto = input.value.trim();
        if (texto) {
            textos.push({ id: crypto.randomUUID(), texto: texto, pasta: null });
            input.value = "";
            await atualizarStorage();
            chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Recria menu
        }
    };

    // --- Adicionar Item (Modo Avançado) ---
    document.getElementById("btnAdicionarAvancado").onclick = async () => {
        const textarea = document.getElementById("multiInput");
        const pastaSelect = document.getElementById("pastaSelect");
        const textoInput = textarea.value; // Pega todo o texto

        if (!textoInput.trim()) return; // Sai se estiver vazio

        const pastaId = pastaSelect.value !== "novaPasta" && pastaSelect.value !== "" ? pastaSelect.value : null;

        let itemsToAdd = [];
        const useCustomSeparator = separatorModeCustom.checked;
        const separator = customSeparatorInput.value.trim() || ';'; // Usa ';' se custom estiver vazio

        if (useCustomSeparator) {
            // Divide pelo separador customizado
            itemsToAdd = textoInput.split(separator);
        } else {
            // Divide por nova linha (padrão)
            itemsToAdd = textoInput.split('\n');
        }

        // Limpa e filtra itens vazios resultantes do split
        itemsToAdd = itemsToAdd.map(item => item.trim()).filter(item => item);

        if (itemsToAdd.length > 0) {
            itemsToAdd.forEach(itemText => {
                textos.push({
                    id: crypto.randomUUID(), // Gera ID
                    texto: itemText,
                    pasta: pastaId
                });
            });
            textarea.value = ""; // Limpa o textarea
            await atualizarStorage();
            chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Recria menu
            showToast(`${itemsToAdd.length} item(s) adicionado(s)!`, 'success');// Feedback
        } else {
             showToast("Nenhum item válido encontrado para adicionar.", 'info');
        }
    };

    // --- Gerenciamento de Pastas ---
    document.getElementById("pastaSelect").onchange = (e) => {
        // Mostra/esconde input de nova pasta
        folderManagement.style.display = e.target.value === "novaPasta" ? "block" : "none";
        if (e.target.value === "novaPasta") {
             document.getElementById("novaPasta").focus();
        }
    };

    document.getElementById("btnAddFolder").onclick = async () => {
        const input = document.getElementById("novaPasta");
        const nome = input.value.trim();
        if (nome && !pastas.some(p => p.nome.replace(/^📁\s*/, '').toLowerCase() === nome.toLowerCase())) {// Evita duplicados (ignorando ícone e case)
            // Gera um ID único baseado no timestamp e nome simplificado
            const id = `pasta_${Date.now()}_${nome.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 15)}`;
            pastas.push({ id, nome: `📁 ${nome}` }); // Adiciona ícone de pasta correto
            input.value = "";
            folderManagement.style.display = "none"; // Esconde após adicionar
            await atualizarStorage();
            atualizarSelectPastas(); // Atualiza o select imediatamente
             document.getElementById("pastaSelect").value = id; // Seleciona a pasta recém-criada
            chrome.runtime.sendMessage({ acao: "recriarMenu" }); // Recria menu
        } else if (nome) {
             showToast("Já existe uma pasta com esse nome.", 'warning');
        }
    };

    // --- Importação/Exportação ---
    document.getElementById('btnExportar').addEventListener('click', exportarConfiguracoes);

    document.getElementById('btnImportar').addEventListener('click', () => {
        document.getElementById('importFile').click(); // Abre o seletor de arquivos
    });

    document.getElementById('importFile').addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
             // Resetar o valor do input para permitir importar o mesmo arquivo novamente se necessário
             e.target.value = null;
            try {
                 await importarConfiguracoes(file);
                 // O reload é feito dentro de importarConfiguracoes em caso de sucesso
            } catch (error) {
                 console.error("Falha no processo de importação:", error);
                 // Alerta já é mostrado dentro de importarConfiguracoes
            }
        }
    });

    // --- Inicialização da UI ---
    renderizarLista();
    atualizarSelectPastas();
    toggleMode("simple"); // Inicia no modo simples por padrão
});
