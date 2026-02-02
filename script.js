document.addEventListener('DOMContentLoaded', () => {
    // 1. Flip do Super Card Superior (Ativado pelo clique no card todo)
    const superCard = document.getElementById('mainSuperCard');
    if (superCard) {
        superCard.addEventListener('click', () => {
            superCard.classList.toggle('flipped');
        });
    }

    // 2. Flip dos Cards das Entidades (Ativado apenas pelos botões)
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        const flipButtons = card.querySelectorAll('.btn-flip');
        flipButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede o clique de subir para outros elementos
                card.classList.toggle('flipped');
            });
        });
    });
});
