    // 1. Configuração (Sempre no topo)
    const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    function gerarGradeHorarios(abertura, fechamento, intervalo, agendados) {
        const diasParaGerar = window.periodoAgenda === 'semana' ? 7 : 1;
        const gradeCompleta = [];

        for (let i = 0; i < diasParaGerar; i++) {
            const dataReferencia = new Date();
            dataReferencia.setDate(dataReferencia.getDate() + i);
            const dataISO = dataReferencia.toISOString().split('T')[0];

            let horaAtual = abertura;
            while (horaAtual < fechamento) {
                const dataHoraSlot = `${dataISO}T${horaAtual}:00`;
                const agendamento = agendados.find(a => a.data_hora_inicio.startsWith(`${dataISO}T${horaAtual}`));

                gradeCompleta.push({
                    data: dataISO,
                    hora: horaAtual,
                    dados: agendamento || null
                });

                let [h, m] = horaAtual.split(':').map(Number);
                m += intervalo;
                if (m >= 60) { h++; m -= 60; }
                horaAtual = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            }
        }
        return gradeCompleta;
    }

    let dadosEstabelecimento = null;

    function generateContent() {
        const input = document.getElementById('cmd-input').value;
        const chat = document.getElementById('chat-criar');
        if(!input) return;
        const div = document.createElement('div'); 
        div.className = 'msg-user'; 
        div.innerText = input;
        chat.appendChild(div);
        document.getElementById('cmd-input').value = "";
        chat.scrollTop = chat.scrollHeight;
    }

    async function init() {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get('s');
        if (!slug) {
            document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Slug ausente (?s=slug)</p>";
            return;
        }
        const { data } = await supabaseClient.from('estabelecimentos').select('*').eq('slug', slug).single();
        if (data) {
            dadosEstabelecimento = data;
            document.getElementById('salon-name').innerText = data.nome_fantasia;
            setupTabs(); 
        } else {
            document.getElementById('view-body').innerHTML = "<p style='text-align:center'>Salão não encontrado.</p>";
        }
    }

    function setupTabs() {
        const params = new URLSearchParams(window.location.search);
        const userType = params.get('u') || 'cliente'; 
        const tabsContainer = document.getElementById('dynamic-tabs');
        const abasPermitidas = PERFIS[userType];
        tabsContainer.innerHTML = '';
        abasPermitidas.forEach((aba, index) => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${index === 0 ? 'active' : ''}`;
            tabElement.innerText = aba.label;
            tabElement.onclick = () => switchTabLite(aba.id, tabElement);
            tabsContainer.appendChild(tabElement);
        });
        if(abasPermitidas.length > 0) switchTabLite(abasPermitidas[0].id, tabsContainer.firstChild);
    }

    async function switchTabLite(viewId, element) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        element.classList.add('active');
        
        const title = document.getElementById('view-title');
        const body = document.getElementById('view-body');
        const abaGestao = document.getElementById('aba-gestao');

        if (abaGestao) abaGestao.style.display = 'none';

        if (viewId === 'dashboard') {
            title.innerText = "CONFIGURAÇÕES DE GESTÃO";
            body.innerHTML = ""; 
            if (abaGestao) abaGestao.style.display = 'block';
            return; 
        }

        body.innerHTML = "<p style='text-align:center; opacity:0.5'>Buscando...</p>";
        let dataSelecionada = new Date().toISOString().split('T')[0];
        window.periodoAgenda = window.periodoAgenda || 'dia';

        let htmlFiltros = `
            <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
                <button onclick="window.periodoAgenda='dia'; switchTabLite('agenda', document.querySelector('.tab.active'))" 
                    style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${window.periodoAgenda === 'dia' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Dia</button>
                <button onclick="window.periodoAgenda='semana'; switchTabLite('agenda', document.querySelector('.tab.active'))" 
                    style="padding: 8px 15px; border-radius: 20px; border: 1px solid #2ecc71; background: ${window.periodoAgenda === 'semana' ? '#2ecc71' : 'transparent'}; color: white; cursor: pointer;">Semana</button>
            </div>`;

        if (viewId === 'agenda') {
            title.innerText = "AGENDA";
            const userType = new URLSearchParams(window.location.search).get('u') || 'cliente';
            const diasRange = window.periodoAgenda === 'semana' ? 7 : 0;
            const dataFim = new Date();
            dataFim.setDate(new Date().getDate() + diasRange);
            const dataFimISO = dataFim.toISOString().split('T')[0];

            const { data } = await supabaseClient.from('agendamentos')
                .select('*, profissionais(nome), servicos(nome)')
                .eq('estabelecimento_id', dadosEstabelecimento.id)
                .gte('data_hora_inicio', dataSelecionada + 'T00:00:00')
                .lte('data_hora_inicio', dataFimISO + 'T23:59:59')
                .order('data_hora_inicio');        
            
            const grade = gerarGradeHorarios(dadosEstabelecimento.hora_abertura, dadosEstabelecimento.hora_fechamento, dadosEstabelecimento.intervalo_slot, data || []);
            
            let htmlAgenda = '<div class="agenda-list">';
            let ultimaData = "";

            grade.forEach(slot => {
                if (window.periodoAgenda === 'semana' && slot.data !== ultimaData) {
                    const dataFormatada = new Date(slot.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
                    htmlAgenda += `<div style="grid-column: 1/-1; background: rgba(255,255,255,0.1); padding: 8px; margin-top: 15px; border-radius: 5px; font-size: 0.8em; text-transform: uppercase; color: #2ecc71;">${dataFormatada}</div>`;
                    ultimaData = slot.data;
                }

                const exibirPrivado = (userType === 'dono' || userType === 'funcionario');
                const estaOcupado = slot.dados !== null;
                const nomeExibido = estaOcupado ? (exibirPrivado ? slot.dados.cliente_nome : "INDISPONÍVEL") : "DISPONÍVEL";
                const servicoExibido = estaOcupado ? (exibirPrivado ? (slot.dados.servicos?.nome || 'Serviço') : "Horário reservado") : "Toque para agendar";
                const corStatus = estaOcupado ? "#e74c3c" : "#2ecc71";

                htmlAgenda += `
                    <div class="agenda-item" style="border-left: 4px solid ${corStatus}; opacity: ${estaOcupado && !exibirPrivado ? '0.6' : '1'}">
                        <div class="agenda-time">${slot.hora}</div>
                        <div class="agenda-details">
                            <h4 style="color: ${estaOcupado ? '#fff' : corStatus}; margin:0;">${nomeExibido}</h4>
                            <span style="font-size: 0.85em; opacity: 0.7;">${servicoExibido}</span>
                        </div>
                    </div>`;
            });
            body.innerHTML = htmlFiltros + htmlAgenda + '</div>';
        }

        else if (viewId === 'servicos') {
            title.innerText = "SERVIÇOS";
            const { data } = await supabaseClient.from('servicos').select('*').eq('estabelecimento_id', dadosEstabelecimento.id).order('nome');
            
            let htmlServ = '<div class="servicos-list" style="padding: 15px;">'; 
            data?.forEach(s => {
                htmlServ += `
                    <div class="servico-card" style="padding: 15px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                        <div style="text-align: left;">
                            <h4 style="margin: 0; color: #fff;">${s.nome}</h4>
                            <span style="font-size: 0.9em; opacity: 0.6; color: #fff;">${s.duracao || 60} min</span>
                        </div>
                        <div style="font-weight: bold; color: #2ecc71;">R$ ${s.preco}</div>
                    </div>`;
            });
            body.innerHTML = htmlServ + (data?.length ? '</div>' : '<p style="text-align:center; opacity:0.5">Nenhum serviço cadastrado.</p>');
        }
        else {
            title.innerText = viewId.toUpperCase();
            body.innerHTML = `<p style="text-align: center; opacity: 0.5; margin-top: 50px;">Módulo em desenvolvimento...</p>`;
        }
    }

    const PERFIS = {
        cliente: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA' }],
        funcionario: [{ id: 'agenda', label: 'MINHA AGENDA' }],
        dono: [{ id: 'servicos', label: 'SERVIÇOS' }, { id: 'agenda', label: 'AGENDA GERAL' }, { id: 'dashboard', label: 'DASHBOARD' }]
    };

    window.onload = init;
