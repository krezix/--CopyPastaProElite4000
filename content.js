// Flag para indicar que o content script está injetado
window.contentScriptInjected = true;




chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.acao === "inserirTexto") {
      const texto = request.texto;
      const el = document.activeElement;
      
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
          inserirNoCursor(el, texto);
      }
  }
});
  

  function inserirNoCursor(elemento, texto) {
    if (elemento.isContentEditable) {
        elemento.focus();
        document.execCommand("insertText", false, texto);
    } else {
        const start = elemento.selectionStart;
        const end = elemento.selectionEnd;
        
        const textoAntes = elemento.value.substring(0, start);
        const textoDepois = elemento.value.substring(end);
        
        elemento.value = textoAntes + texto + textoDepois;
        elemento.selectionStart = elemento.selectionEnd = start + texto.length;
        
        // Dispara eventos para notificar o site da mudança
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        elemento.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Para sites que usam eventos mais específicos
        elemento.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
        elemento.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', code: 'KeyA', bubbles: true }));
        elemento.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true }));
        
        elemento.dispatchEvent(new Event('compositionend', { bubbles: true }));
        
        elemento.focus();
    }

    // Força uma atualização do React/Angular
    setTimeout(() => {
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        elemento.dispatchEvent(new Event('change', { bubbles: true }));
    }, 0);
}