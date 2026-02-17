// constants.js
// Armazena constantes e configurações globais.

const PERFIS = {
    cliente: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA' }],
    funcionario: [{ id: 'agenda', label: 'MINHA AGENDA' }], // Manter esta opção se for implementar funcionários no futuro
    dono: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA GERAL' }, { id: 'dashboard', label: 'DASHBOARD' }]
};

// Outras constantes futuras podem ser adicionadas aqui.
// Ex: INTERVALO_SLOT_PADRAO = 30;

export { PERFIS };
