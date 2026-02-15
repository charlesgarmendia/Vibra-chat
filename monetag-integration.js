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
                if (typeof monetag !== 'undefined' && monetag.init) {
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
                            document.dispatchEvent(new CustomEvent('monetag-ad-shown'));
                        },
                        onClose: function() {
                            console.log('Anuncio cerrado');
                            document.dispatchEvent(new CustomEvent('monetag-ad-closed'));
                        },
                        onError: function(error) {
                            console.error('Error Monetag:', error);
                        }
                    });
                    
                    monetag.load();
                }
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
            
            const adClosedHandler = () => {
                document.removeEventListener('monetag-ad-closed', adClosedHandler);
                resolve();
            };
            
            document.addEventListener('monetag-ad-closed', adClosedHandler);
            
            if (window.monetag.cmd) {
                window.monetag.cmd.push(function() {
                    if (typeof monetag !== 'undefined' && monetag.display) {
                        monetag.display();
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
            
            setTimeout(() => {
                document.removeEventListener('monetag-ad-closed', adClosedHandler);
                resolve();
            }, 10000);
        });
    }
    
    // API pública
    window.MonetagIntegration = {
        init: initMonetag,
        showAd: showAd,
        isLoaded: () => !!(window.monetag && typeof monetag !== 'undefined')
    };
    
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
            initMonetag();
        }
    });
    
})();