//atualizado para calculo de comissoes e edição de cadastros - 7 
const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let salaoIdAtual = null;

async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'acesso.html';
        return;
    }
    await carregarDadosIniciais(session.user.id);
}

async function carregarDadosIniciais(donoId) {
    // Agora buscamos também o 'slug'
    const { data: saloes } = await supabaseClient
        .from('estabelecimentos')
        .select('id, slug') 
        .eq('dono_id', donoId)
        .limit(1);

    if (saloes && saloes.length > 0) {
        salaoIdAtual = saloes[0].id;
        const slug = saloes[0].slug;

        // Configura o link de volta para a agenda do dono
        const linkAgenda = document.getElementById('link-voltar-agenda');
        if (linkAgenda) {
            linkAgenda.href = `agenda.html?s=${slug}&u=dono`;
        }

        atualizarDashboard(salaoIdAtual);
    } else {
        console.error("Nenhum estabelecimento encontrado.");
        const displayNome = document.getElementById('salon-name-display');
        if (displayNome) displayNome.innerText = "SEM ESTABELECIMENTO";
    }
}

async function atualizarDashboard(salaoId) {
    try {
        const agora = new Date();
        const hojeISO = agora.toLocaleDateString('sv-SE'); 

        // 1. DADOS DO ESTABELECIMENTO
        const { data: estab } = await supabaseClient.from('estabelecimentos').select('nome_fantasia, ia_saudacao').eq('id', salaoId).single();
        if (estab) {
            const displayNome = document.getElementById('salon-name-display');
            if (displayNome) displayNome.innerText = estab.nome_fantasia;
            const inputIA = document.getElementById('ia-saudacao-input');
            if (inputIA) inputIA.value = estab.ia_saudacao || "";
        }

        // 2. BUSCA FINANCEIRA
        const { data: movs } = await supabaseClient
            .from('movimentacoes_financeiras')
            .select('valor, data_movimentacao, profissional_id')
            .eq('estabelecimento_id', salaoId);

        // 3. BUSCA AGENDAMENTOS
        const { data: agsMes } = await supabaseClient
            .from('agendamentos')
            // CORREÇÃO: Usar a sintaxe de join para obter nome do cliente, serviço e profissional
            .select('id, data_hora_inicio, clientes(nome, whatsapp), servicos(nome), profissionais(nome)') 
            .eq('estabelecimento_id', salaoId);

        // 4. BUSCA PROFISSIONAIS
        const { data: profs } = await supabaseClient
            .from('profissionais')
            .select('id, nome, tipo_remuneracao, valor_comissao_porcentagem, whatsapp')
            .eq('estabelecimento_id', salaoId);

        // 5. BUSCA NOMES DOS SERVIÇOS
        const { data: servicos } = await supabaseClient
            .from('servicos')
            .select('id, nome, preco, duracao_minutos, descricao')
            .eq('estabelecimento_id', salaoId);

        // --- CÁLCULOS FINANCEIROS ---
        const fatHoje = movs?.filter(m => 
            m.data_movimentacao && m.data_movimentacao.toString().includes(hojeISO)
        ).reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        const fatTotal = movs?.reduce((acc, c) => acc + Number(c.valor), 0) || 0;

        if (document.getElementById('fat-hoje')) document.getElementById('fat-hoje').innerText = `R$ ${fatHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (document.getElementById('fat-mes')) document.getElementById('fat-mes').innerText = `R$ ${fatTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        if (document.getElementById('fat-semana')) document.getElementById('fat-semana').innerText = `R$ ${fatTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

        // --- ATUALIZAÇÃO DOS CARDS DE AGENDAMENTOS ---
        const totalHoje = agsMes?.filter(a => a.data_hora_inicio && a.data_hora_inicio.toString().includes(hojeISO)).length || 0;
        const totalGeral = agsMes?.length || 0;

        if (document.getElementById('ag-hoje')) document.getElementById('ag-hoje').innerText = totalHoje;
        if (document.getElementById('ag-mes')) document.getElementById('ag-mes').innerText = totalGeral;
        if (document.getElementById('ag-semana')) document.getElementById('ag-semana').innerText = totalGeral; 

        // --- DETALHAMENTO DE CLIENTES ---
        let listaClientesHTML = '';
        const agendamentosOrdenados = agsMes?.sort((a, b) => new Date(a.data_hora_inicio) - new Date(b.data_hora_inicio)) || [];

         agendamentosOrdenados.forEach(a => {
            const dataFmt = a.data_hora_inicio ? new Date(a.data_hora_inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/--';
            // Acessar dados do cliente aninhados
            const clienteNome = a.clientes?.nome || 'Cliente s/ nome';
            const clienteWhatsapp = a.clientes?.whatsapp;
            const whatsLink = clienteWhatsapp ? `https://wa.me/${clienteWhatsapp.replace(/\\D/g, '')}` : '#';
            
            // Acessar nome do profissional aninhado
            const nomeProf = a.profissionais?.nome || `Prof. ID: ${a.profissional_id}`;

            // Acessar nome do serviço aninhado
            const nomeServico = a.servicos?.nome || `Serviço ID: ${a.servico_id}`;

            listaClientesHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #333; font-size: 0.85rem;">
                    <div>
                        <strong style="display:block; color:#2ecc71;">${clienteNome}</strong>
                        <span style="color:#ddd; display:block;">Profissional: ${nomeProf}</span>
                        <span style="color:#888;">${nomeServico} | ${dataFmt}</span>
                    </div>
                    ${clienteWhatsapp ? `<a href="${whatsLink}" target="_blank" style="background:#25d366; color:white; padding:5px 10px; border-radius:5px; text-decoration:none; font-size:0.75rem;">WhatsApp</a>` : ''}
                </div>`;
        });

        const containerClientes = document.getElementById('lista-clientes-detalhe');
        if (containerClientes) {
            containerClientes.innerHTML = listaClientesHTML || '<div style="padding:10px; text-align: center; color: #888;">Nenhum cliente agendado.</div>';
        }

        // --- PERFORMANCE EQUIPE E CÁLCULO DE COMISSÕES ---
        let totalComissoesGeral = 0;
        let ranking = {};
        let listaComissoesHTML = '';

        if (profs && profs.length > 0) {
            profs.forEach(p => {
                const faturamentoBrutoProf = movs?.filter(m => String(m.profissional_id) === String(p.id))
                    .reduce((acc, c) => acc + Number(c.valor), 0) || 0;

                let comissaoDevida = 0;
                const tipo = p.tipo_remuneracao?.toLowerCase();
                const valorRegra = Number(p.valor_comissao_porcentagem) || 0;

                if (tipo === 'comissao' || tipo === 'percentual' || tipo === 'comissão') {
                    comissaoDevida = faturamentoBrutoProf * (valorRegra / 100);
                } else {
                    const qtdAgendamentos = agsMes?.filter(a => String(a.profissional_id) === String(p.id)).length || 0;
                    comissaoDevida = qtdAgendamentos * valorRegra;
                }

                totalComissoesGeral += comissaoDevida;
                ranking[p.nome] = faturamentoBrutoProf;

                listaComissoesHTML += `
                    <div onclick='abrirEdicaoProf(${JSON.stringify(p)})' style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #333; cursor:pointer;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold; color:#fff;">${p.nome} ✏️</span>
                            <small style="color:#888;">Bruto: R$ ${faturamentoBrutoProf.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</small>
                        </div>
                        <div style="text-align:right;">
                            <span style="display:block; color:#2ecc71; font-weight:bold;">R$ ${comissaoDevida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                            <small style="font-size:0.7rem; color:#666;">COMISSÃO</small>
                        </div>
                    </div>`;
            });
        }

        if (document.getElementById('top-barbeiro')) {
            const temRanking = Object.keys(ranking).length > 0;
            document.getElementById('top-barbeiro').innerText = temRanking 
                ? Object.keys(ranking).reduce((a, b) => ranking[a] > ranking[b] ? a : b) 
                : "---";
        }

        if (document.getElementById('total-comissao')) {
            document.getElementById('total-comissao').innerText = `R$ ${totalComissoesGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        }

        if (document.getElementById('lista-comissoes')) {
            document.getElementById('lista-comissoes').innerHTML = listaComissoesHTML || '<span style="color:#666; padding:10px; display:block;">Sem movimentações</span>';
        }

        // --- GESTÃO DE SERVIÇOS ---
        let listaServicosHTML = '';
        if (servicos && servicos.length > 0) {
            servicos.forEach(s => {
                listaServicosHTML += `
                    <div onclick='abrirEdicaoServ(${JSON.stringify(s)})' style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #333; cursor:pointer;">
                        <div style="text-align: left;">
                            <strong style="color:#2ecc71; display:block;">${s.nome} ✏️</strong>
                            <small style="color:#888; display:block;">${s.duracao_minutos || 0} min | ${s.descricao || 'Sem descrição'}</small>
                        </div>
                        <div style="font-weight:bold; color:white;">R$ ${Number(s.preco).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                    </div>`;
            });
        }
        const containerServicos = document.getElementById('lista-servicos-gestao');
        if (containerServicos) {
            containerServicos.innerHTML = listaServicosHTML || '<div style="padding:10px; color:#888;">Nenhum serviço cadastrado.</div>';
        }

    } catch (err) {
        console.error("Erro Geral Dashboard:", err);
    }
}

// --- FUNÇÕES DE EDIÇÃO (MODAIS) ---
function abrirEdicaoProf(p) {
    document.getElementById('edit-prof-id').value = p.id;
    document.getElementById('edit-prof-nome').value = p.nome;
    document.getElementById('edit-prof-whatsapp').value = p.whatsapp || "";
    document.getElementById('edit-prof-tipo').value = p.tipo_remuneracao || "comissao";
    document.getElementById('edit-prof-valor').value = p.valor_comissao_porcentagem || 0;
    document.getElementById('modal-edit-prof').style.display = 'flex';
}

async function salvarEdicaoProf() {
    const id = document.getElementById('edit-prof-id').value;
    const dados = {
        nome: document.getElementById('edit-prof-nome').value,
        whatsapp: document.getElementById('edit-prof-whatsapp').value,
        tipo_remuneracao: document.getElementById('edit-prof-tipo').value,
        valor_comissao_porcentagem: parseFloat(document.getElementById('edit-prof-valor').value)
    };
    const { error } = await supabaseClient.from('profissionais').update(dados).eq('id', id);
    if (error) alert("Erro ao atualizar profissional: " + error.message);
    else {
        alert("Profissional atualizado com sucesso!");
        fecharModalEdit('prof');
        atualizarDashboard(salaoIdAtual);
    }
}

function abrirEdicaoServ(s) {
    document.getElementById('edit-serv-id').value = s.id;
    document.getElementById('edit-serv-nome').value = s.nome;
    document.getElementById('edit-serv-preco').value = s.preco;
    document.getElementById('edit-serv-duracao').value = s.duracao_minutos || 30;
    document.getElementById('edit-serv-descricao').value = s.descricao || "";
    document.getElementById('modal-edit-serv').style.display = 'flex';
}

async function salvarEdicaoServ() {
    const id = document.getElementById('edit-serv-id').value;
    const dados = {
        nome: document.getElementById('edit-serv-nome').value,
        preco: parseFloat(document.getElementById('edit-serv-preco').value),
        duracao_minutos: parseInt(document.getElementById('edit-serv-duracao').value),
        descricao: document.getElementById('edit-serv-descricao').value
    };
    const { error } = await supabaseClient.from('servicos').update(dados).eq('id', id);
    if (error) alert("Erro ao atualizar serviço: " + error.message);
    else {
        alert("Serviço atualizado com sucesso!");
        fecharModalEdit('serv');
        atualizarDashboard(salaoIdAtual);
    }
}

function fecharModalEdit(tipo) {
    document.getElementById(`modal-edit-${tipo}`).style.display = 'none';
}

const btnSalvarIA = document.getElementById('btn-salvar-ia');
if (btnSalvarIA) {
    btnSalvarIA.addEventListener('click', async () => {
        if (!salaoIdAtual) return;
        const novaSaudacao = document.getElementById('ia-saudacao-input').value;
        const { error } = await supabaseClient.from('estabelecimentos').update({ ia_saudacao: novaSaudacao }).eq('id', salaoIdAtual);
        if (error) alert("Erro: " + error.message);
        else alert("Saudação atualizada!");
    });
}

const monitorarMudancas = supabaseClient
    .channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        if (salaoIdAtual) atualizarDashboard(salaoIdAtual);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_financeiras' }, () => {
        if (salaoIdAtual) atualizarDashboard(salaoIdAtual);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profissionais' }, () => {
        if (salaoIdAtual) atualizarDashboard(salaoIdAtual);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'servicos' }, () => {
        if (salaoIdAtual) atualizarDashboard(salaoIdAtual);
    })
    .subscribe();

// --- LÓGICA DE NAVEGAÇÃO E LOGOUT ---
async function configurarNavegacao(slug) {
    const linkAgenda = document.getElementById('link-voltar-agenda');
    const btnLogout = document.getElementById('btn-logout');

    if (linkAgenda) {
        linkAgenda.href = `agenda.html?s=${slug}&u=dono`;
    }

    if (btnLogout) {
        btnLogout.onclick = async (e) => {
            e.preventDefault();
            const { error } = await supabaseClient.auth.signOut();
            if (error) alert("Erro ao sair: " + error.message);
            else window.location.href = 'acesso.html';
        };
    }
}

checkUser();
