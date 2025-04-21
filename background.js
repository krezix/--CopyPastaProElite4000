let menuCriado = false; // Flag para controlar se o menu já foi criado

// Listener para o evento onChanged do storage
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' && !menuCriado) {  // Verifica se é o storage local e se o menu ainda não foi criado
        const lock = await chrome.storage.local.get('menuCreationLock');
        if (!lock.menuCreationLock) { // Verifica o bloqueio (após o storage estar pronto)
            await criarMenuDeContexto();
            menuCriado = true; // Define a flag para evitar criar o menu novamente
        }
    }
});


chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("onInstalled event triggered. Reason:", details.reason);
    menuCriado = false; // Reseta a flag ao instalar/atualizar
    await chrome.storage.local.remove('menuCreationLock'); // Remove o bloqueio
    // A criação do menu agora é controlada pelo listener chrome.storage.onChanged
});

 

async function criarMenuDeContexto() {


     // Usa chrome.storage para o bloqueio persistente
    const lock = await chrome.storage.local.get('menuCreationLock');
    if (lock.menuCreationLock) {
        console.log('Criação de menu já em andamento, pulando.');
        return;
    }

    // Define o bloqueio no storage
    await chrome.storage.local.set({ menuCreationLock: true });
    console.log('Iniciando criação do menu...');

    try {
        // Remove menus antigos ANTES de buscar os dados
        await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
        console.log('Menus antigos removidos.');

        // Busca dados E a configuração de numeração
        const { textos, pastas, config } = await chrome.storage.local.get(["textos", "pastas", "config"]);
        const enableNumbering = config?.enableNumbering ?? false; // Pega a config ou usa false

        if (!textos || !textos.length) {
            console.log('Nenhum texto encontrado para criar menu.');
            await chrome.storage.local.remove('menuCreationLock'); // Limpa trava
            return;
        }

        const timestamp = Date.now(); // Garante IDs únicos

        // Cria menu principal
        chrome.contextMenus.create({
            id: `menuPrincipal_${timestamp}`,
            title: "Inserir texto mágico ✨", // Título atualizado
            contexts: ["editable"]
        });

        // Agrupa itens por pasta (sem alterações)
        const itensPorPasta = {};
        textos.forEach((item, index) => {
            const pastaId = item.pasta || "semPasta"; // Usa null ou ID da pasta
            if (!itensPorPasta[pastaId]) {
                itensPorPasta[pastaId] = [];
            }
            itensPorPasta[pastaId].push({ ...item, originalIndex: index });
        });

        // Função interna para criar item de menu (com lógica de numeração)
        function criarItemMenu(parentId, item, visualIndex) {
            const MAX_TITLE_LENGTH = 50;
            let numeroPrefixo = "";
            if (enableNumbering) {
                // Formata número com 3 dígitos (001, 002...)
                numeroPrefixo = String(visualIndex).padStart(2, '0') + ". ";
            }

            let itemTitle = numeroPrefixo + item.texto;
            // Ajusta o tamanho máximo do título considerando o prefixo
            const maxTextoLength = MAX_TITLE_LENGTH - numeroPrefixo.length - 3; // 3 para "..."
            if (itemTitle.length > MAX_TITLE_LENGTH) {
                 // Corta o texto original, não o título com prefixo
                 itemTitle = numeroPrefixo + item.texto.substring(0, maxTextoLength) + "...";
            }


            chrome.contextMenus.create({
                // ID USA O ÍNDICE ORIGINAL DO ARRAY 'textos'
                id: `item_${item.originalIndex}_${timestamp}`,
                parentId: parentId,
                title: itemTitle, // Título com ou sem número
                contexts: ["editable"]
            });
        }


                // Função para criar submenu de uma pasta (ADAPTADA PARA NUMERAÇÃO LOCAL)
        function criarSubmenuPasta(pastaId, itens, nomePasta) {
            const MAX_ITENS_POR_SUBMENU = 15; // Limite seguro

            // Define o ID pai inicial
            let parentIdParaItens = `menuPrincipal_${timestamp}`;
            let nomePastaReal = nomePasta || (pastaId === "semPasta" ? "Itens sem pasta" : `Pasta (${pastaId})`);

            // Se for uma pasta real, cria o item de menu da pasta
            if (pastaId !== "semPasta") {
                 const pastaMenuId = `pasta_${pastaId}_${timestamp}`;
                 chrome.contextMenus.create({
                     id: pastaMenuId,
                     parentId: `menuPrincipal_${timestamp}`,
                     title: `📁 ${nomePastaReal.replace(/^📁\s*/, '')}`, // Garante ícone
                     contexts: ["editable"]
                 });
                 parentIdParaItens = pastaMenuId; // Itens irão dentro deste submenu
            }

            if (itens.length > MAX_ITENS_POR_SUBMENU) {
                // Divide em submenus numerados "Itens X-Y"
                for (let i = 0; i < itens.length; i += MAX_ITENS_POR_SUBMENU) {
                    const grupoItens = itens.slice(i, i + MAX_ITENS_POR_SUBMENU);
                    const inicio = i + 1;
                    const fim = Math.min(i + MAX_ITENS_POR_SUBMENU, itens.length);

                    const grupoId = `pasta_${pastaId}_grupo_${i}_${timestamp}`;
                    chrome.contextMenus.create({
                        id: grupoId,
                        parentId: parentIdParaItens,
                        title: `Itens ${inicio}-${fim}`, // Título do subgrupo
                        contexts: ["editable"]
                    });

                    // Cria itens dentro do grupo numerado
                    grupoItens.forEach((item, idx) => {
                        // *** MUDANÇA AQUI: O índice visual é relativo AO INÍCIO DA PASTA (i + idx + 1) ***
                        criarItemMenu(grupoId, item, i + idx + 1);
                    });
                }
            } else {
                // Adiciona itens diretamente ao submenu da pasta ou ao menu principal
                 itens.forEach((item, idx) => {
                     // *** MUDANÇA AQUI: O índice visual é relativo ao início da pasta (idx + 1) ***
                     criarItemMenu(parentIdParaItens, item, idx + 1);
                 });
            }
        }

         

        // Criar menus para cada pasta (lógica principal)
        const pastaIdsOrdenadas = Object.keys(itensPorPasta).sort((a, b) => {
             if (a === "semPasta") return 1; // "semPasta" vai para o final
             if (b === "semPasta") return -1;
             // Ordena pastas reais alfabeticamente (opcional)
             const pastaA = pastas?.find(p => p.id === a);
             const pastaB = pastas?.find(p => p.id === b);
             const nomeA = pastaA?.nome.toLowerCase() || a;
             const nomeB = pastaB?.nome.toLowerCase() || b;
             return nomeA.localeCompare(nomeB);
        });

        pastaIdsOrdenadas.forEach(pastaId => {
             const itens = itensPorPasta[pastaId];
             if (pastaId === "semPasta") {
                 // Passa null como nome, a função tratará como "Itens sem pasta"
                 criarSubmenuPasta(pastaId, itens, null);
             } else {
                 const pasta = pastas?.find(p => p.id === pastaId);
                 // Passa o nome da pasta encontrado ou um placeholder
                 criarSubmenuPasta(pastaId, itens, pasta ? pasta.nome : `Pasta (${pastaId}) - Removida?`);
             }
        });


        console.log('Menu de contexto criado/atualizado com sucesso.');

    } catch (error) {
        console.error('Erro ao criar menu de contexto:', error);
        // Tenta logar detalhes específicos se disponíveis
        if (error.message) {
             console.error('Detalhes do erro:', error.message);
        }
    } finally {
        // Libera a trava (sem alterações)
        
        await chrome.storage.local.remove('menuCreationLock');
        console.log('Trava de criação de menu liberada.');
    }
}

// Listener para recriar o menu (quando o popup pede)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.acao === "recriarMenu") {
        console.log("Recebida solicitação para recriar menu.");
        // Chama a função principal de criação (que tem a trava)
        criarMenuDeContexto().then(() => {
             sendResponse({ status: "Menu recreation process started" });
        }).catch(error => {
             console.error("Erro ao tentar recriar menu via mensagem:", error);
             sendResponse({ status: "Error starting menu recreation", error: error.message });
        });
        return true; // Indica resposta assíncrona
    }
    // Adicionar outros listeners de mensagem aqui se necessário
});

// Listener de clique no menu (sem alterações na lógica principal de extração de índice)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Verifica se é um item de texto clicado
    if (info.menuItemId.startsWith("item_")) {
        const parts = info.menuItemId.split("_");
        // O índice original está sempre na segunda parte (índice 1)
        const originalIndex = parseInt(parts[1], 10);

        if (isNaN(originalIndex)) {
            console.error('Não foi possível extrair o índice original do item:', info.menuItemId);
            return;
        }

        console.log(`Item clicado. ID: ${info.menuItemId}, Índice extraído: ${originalIndex}`);

        try {
            // Garante que o content script está injetado na aba ativa
            await injetarContentScriptSeNecessario(tab.id);

            // Busca os textos novamente para garantir que temos a versão mais recente
            const { textos } = await chrome.storage.local.get("textos");

            if (textos && textos[originalIndex]) {
                const textoEscolhido = textos[originalIndex].texto; // Pega o texto SEM o número
                console.log(`Texto a ser inserido (Índice ${originalIndex}): "${textoEscolhido}"`);

                // Envia mensagem para content script (com retry)
                let tentativas = 0;
                const maxTentativas = 3;
                while (tentativas < maxTentativas) {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            acao: "inserirTexto",
                            texto: textoEscolhido
                        });
                        console.log(`Mensagem "inserirTexto" enviada com sucesso para tab ${tab.id}.`);
                        break; // Sucesso, sai do loop
                    } catch (error) {
                        tentativas++;
                        console.warn(`Tentativa ${tentativas} de enviar mensagem falhou para tab ${tab.id}: ${error.message}`);
                        if (tentativas === maxTentativas) {
                            console.error('Não foi possível enviar a mensagem após várias tentativas:', error);
                            // Considerar notificar o usuário aqui se falhar consistentemente
                        } else {
                            // Espera um pouco antes de tentar novamente (backoff simples)
                            await new Promise(resolve => setTimeout(resolve, 150 * tentativas));
                        }
                    }
                }
            } else {
                console.error(`Texto com índice original ${originalIndex} não encontrado no storage. Itens atuais:`, textos);
                 // Pode acontecer se o storage foi modificado entre a criação do menu e o clique
                 alert("Erro: O item selecionado não foi encontrado. Tente recarregar a página ou a extensão.");
            }
        } catch (error) {
            console.error('Erro ao processar clique no menu:', error);
             // Erros aqui podem ser de injeção de script ou acesso ao storage
             if (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist")) {
                  console.warn("Falha ao conectar com content script. A página pode ter sido fechada ou não permite scripts.");
             } else if (error.message.includes("Cannot access contents of url")) {
                  console.warn("Não é possível injetar script nesta página (ex: chrome://, loja de extensões).");
             }
        }
    } else {
         console.log("Clique em item de menu não processável (não começa com 'item_'):", info.menuItemId);
    }
});


// Função auxiliar para injetar content script (sem alterações)
async function injetarContentScriptSeNecessario(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => window.contentScriptInjected, // Verifica a flag global no content script
        });
        // Se a função retornou false/undefined ou houve erro na execução (results vazio ou sem result)
        if (!results || !results[0] || !results[0].result) {
            console.log(`Content script não detectado na tab ${tabId}. Injetando...`);
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js'],
            });
             // Define a flag após injetar com sucesso
             await chrome.scripting.executeScript({
                 target: { tabId: tabId },
                 func: () => { window.contentScriptInjected = true; console.log("Flag contentScriptInjected definida."); },
             });
            console.log(`Content script injetado com sucesso na tab ${tabId}.`);
        } else {
             // console.log(`Content script já presente na tab ${tabId}.`); // Log opcional
        }
    } catch (error) {
        // Erros comuns: tentar injetar em páginas restritas ou a aba foi fechada.
        console.warn(`Falha ao verificar/injetar content script na tab ${tabId} (pode ser normal): ${error.message}. Tentando injetar de qualquer forma...`);
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js'],
            });
             await chrome.scripting.executeScript({
                 target: { tabId: tabId },
                 func: () => { window.contentScriptInjected = true; console.log("Flag contentScriptInjected definida após erro inicial."); },
             });
            console.log(`Content script injetado (após erro inicial) na tab ${tabId}.`);
        } catch (injectionError) {
            console.error(`Erro final ao injetar content script na tab ${tabId}: ${injectionError.message}`);
            // Não se pode fazer muito mais aqui, a página provavelmente não permite injeção.
        }
    }
}
