document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. LÓGICA DOS CARDS (FLIP) ---
    // Seleciona todos os botões de flip (frente e verso)
    const flipButtons = document.querySelectorAll('.btn-flip');

    flipButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Evita que o clique dispare outras ações indesejadas
            e.stopPropagation();
            
            // Encontra o card pai mais próximo e adiciona/remove a classe 'flipped'
            const card = button.closest('.card');
            if (card) {
                card.classList.toggle('flipped');
            }
        });
    });

    // --- 2. LÓGICA DO SUPERCARD (FLIP) ---
    const superCard = document.getElementById('mainSuperCard');
    if (superCard) {
        superCard.addEventListener('click', () => {
            superCard.classList.toggle('flipped');
        });
    }

    // --- 3. MENU MOBILE (FECHAR AO CLICAR EM LINK) ---
    const navPrincipal = document.getElementById('nav-principal');
    const navLinks = document.querySelectorAll('.nav-link');

    // Quando clicar em qualquer link do menu, ele fecha o menu automaticamente
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navPrincipal.classList.contains('active')) {
                navPrincipal.classList.remove('active');
            }
        });
    });

    // Fecha o menu se o usuário clicar fora dele enquanto estiver aberto
    document.addEventListener('click', (e) => {
        const menuToggle = document.querySelector('.menu-toggle');
        if (navPrincipal.classList.contains('active') && 
            !navPrincipal.contains(e.target) && 
            !menuToggle.contains(e.target)) {
            navPrincipal.classList.remove('active');
        }
    });

});
