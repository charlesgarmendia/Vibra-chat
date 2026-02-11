// Integración REAL con Monetag
(function() {
    // Tu ID de afiliado de Monetag
    const MONETAG_ID = '10534539';
    
    // Cargar script de Monetag
    function loadMonetagScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://omg10.com/4/${MONETAG_ID}`;
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    // Inicializar Monetag
    async function initMonetag() {
        try {
            await loadMonetagScript();
            
            // Configurar Monetag
            window.monetag = window.monetag || {};
            window.monetag.cmd = window.monetag.cmd || [];
            
            window.monetag.cmd.push(function() {
                // Configuración avanzada
                monetag.init({
                    id: MONETAG_ID,
                    type: 'popunder',
                    position: 'right',
                    style: {
                        width: '728px',
                        height: '90px',
                        backgroundColor: '#0a0a0a',
                        borderColor: '#ffd700',
                        textColor: '#ffffff'
                    },
                    onLoad: function() {
                        console.log('Monetag cargado correctamente');
                    },
                    onDisplay: function() {
                        console.log('Anuncio mostrado');
                        // Emitir evento
                        document.dispatchEvent(new CustomEvent('monetag-ad-shown'));
                    },
                    onClose: function() {
                        console.log('Anuncio cerrado');
                        // Emitir evento
                        document.dispatchEvent(new CustomEvent('monetag-ad-closed'));
                    },
                    onError: function(error) {
                        console.error('Error Monetag:', error);
                    }
                });
                
                monetag.load();
            });
            
            return true;
            
        } catch (error) {
            console.error('Error cargando Monetag:', error);
            return false;
        }
    }
    
    // Mostrar anuncio
    function showAd() {
        return new Promise((resolve) => {
            if (!window.monetag) {
                console.warn('Monetag no disponible');
                resolve();
                return;
            }
            
            // Configurar listener para cuando se cierre el anuncio
            const adClosedHandler = () => {
                document.removeEventListener('monetag-ad-closed', adClosedHandler);
                resolve();
            };
            
            document.addEventListener('monetag-ad-closed', adClosedHandler);
            
            // Mostrar anuncio
            window.monetag.cmd.push(function() {
                monetag.display();
            });
            
            // Timeout por seguridad
            setTimeout(() => {
                document.removeEventListener('monetag-ad-closed', adClosedHandler);
                resolve();
            }, 10000); // 10 segundos máximo
        });
    }
    
    // API pública
    window.MonetagIntegration = {
        init: initMonetag,
        showAd: showAd,
        isLoaded: () => !!window.monetag
    };
    
    // Auto-inicializar cuando el DOM esté listo
    document.addEventListener('DOMContentLoaded', () => {
        // Solo inicializar si no estamos en localhost
        if (!window.location.hostname.includes('localhost')) {
            initMonetag();
        }
    });
    
})();