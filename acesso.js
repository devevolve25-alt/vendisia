const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let userLogado = null;
const urlParams = new URLSearchParams(window.location.search);
let planoEscolhido = urlParams.get('plano') || localStorage.getItem('plano_mercuria');

// Função para gerenciar a visibilidade das telas
function showStep(stepId) {
    document.getElementById('step-loading').classList.remove('active');
    document.getElementById('step-login').classList.remove('active');
    document.getElementById('step-cadastro').classList.remove('active');
    document.getElementById('step-planos').classList.remove('active');
    document.getElementById(stepId).classList.add('active');
}

// --- Selecionar plano na própria página e liberar trava ---
function selecionarPlano(idPlano) {
    // 1. Lista de planos permitidos para validação
    const planosPermitidos = ['conecta-facil', 'agenda-pro', 'gestao-total'];

    if (!planosPermitidos.includes(idPlano)) {
        alert("Plano inválido selecionado.");
        showStep('step-planos');
        return;
    }

    // 2. Salva a escolha do plano localmente e na variável global
    planoEscolhido = idPlano;
    localStorage.setItem('plano_mercuria', idPlano);

    // 3. Atualiza a URL sem recarregar a página (Garante que o plano "siga" o usuário)
    const novaUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?plano=' + idPlano;
    window.history.pushState({ path: novaUrl }, '', novaUrl);
    
    // 4. Direcionamento baseado na autenticação
    if (userLogado) {
        // Se já logou (Google ou sessão), libera para criar o salão
        showStep('step-cadastro');
    } else {
        // Se não logou, manda para o card de login/cadastro
        alert("Plano selecionado com sucesso! Agora finalize seu cadastro.");
        showStep('step-login');
    }
}
async function init() {
    try {
        // 1. Captura o plano da URL imediatamente ao carregar
        const params = new URLSearchParams(window.location.search);
        const planoNaUrl = params.get('plano');
        const planosPermitidos = ['conecta-facil', 'agenda-pro', 'gestao-total'];

        // Se o plano da URL for válido, atualiza a variável global
        if (planosPermitidos.includes(planoNaUrl)) {
            planoEscolhido = planoNaUrl;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            userLogado = session.user;
            
            // BARREIRA: Mesmo logado, se não houver plano validado, trava no step-planos
            if (!planosPermitidos.includes(planoEscolhido)) {
                showStep('step-planos');
                return;
            }
            
            verificarEstabelecimento();
        } else {
            showStep('step-login');
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                userLogado = session.user;

                // BARREIRA NO EVENTO: Impede avanço automático após login Google se o plano sumir
                if (!planosPermitidos.includes(planoEscolhido)) {
                    showStep('step-planos');
                } else {
                    verificarEstabelecimento();
                }
            }
        });
    } catch (err) {
        console.error("Erro ao iniciar:", err);
        showStep('step-login');
    }
}

async function loginGoogle() {
    // Lista de planos permitidos para validar a entrada
    const planosPermitidos = ['conecta-facil', 'agenda-pro', 'gestao-total'];

    // BARREIRA: Impede a abertura do Google se o plano não for um dos três oficiais
    if (!planosPermitidos.includes(planoEscolhido)) {
        alert("Por favor, selecione um plano antes de continuar com o Google.");
        showStep('step-planos');
        return; // ISOLAMENTO: O código do Supabase abaixo não é executado
    }

    // Execução do login só ocorre se houver um plano válido
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: window.location.origin + window.location.pathname + "?plano=" + planoEscolhido 
        }
    });
}

async function authSenha(tipo) {
    // Lista de planos válidos para conferência
    const planosValidos = ['conecta-facil', 'agenda-pro', 'gestao-total'];

    // BARREIRA: Se for cadastro (signup), impede o Supabase se não houver um plano válido
    if (tipo === 'signup' && !planosValidos.includes(planoEscolhido)) {
        alert("Ação necessária: Selecione um plano antes de criar sua conta.");
        showStep('step-planos');
        return; // ISOLAMENTO: O código abaixo nunca será lido sem plano
    }

    const email = document.getElementById('email-acesso').value;
    const password = document.getElementById('senha-acesso').value;

    if (!email || !password) return alert("Preencha e-mail e senha.");
    
    showStep('step-loading');
    
    // O Supabase só recebe os dados se a barreira acima for superada
    const { data, error } = (tipo === 'signup') 
        ? await supabaseClient.auth.signUp({ email, password }) 
        : await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Erro: " + error.message);
        showStep('step-login');
    } else if (data.user) {
        userLogado = data.user;
        verificarEstabelecimento();
    }
}

async function verificarEstabelecimento() {
    try {
        // Garantir perfil
        await supabaseClient.from('perfis').upsert([{ id: userLogado.id, email_contato: userLogado.email }], { onConflict: 'id' });

        // Buscar estabelecimento
        const { data } = await supabaseClient.from('estabelecimentos').select('slug').eq('dono_id', userLogado.id).maybeSingle();

        if (data) {
            window.location.href = `agenda.html?s=${data.slug}&u=dono`;
        } else {
            // Se não tem salão, verifica o plano antes de mostrar cadastro
            if (!planoEscolhido || planoEscolhido === 'conecta-facil') {
                showStep('step-planos'); // BARREIRA ATIVADA
            } else {
                showStep('step-cadastro'); // LIBERADO
            }
        }
    } catch (err) {
        showStep('step-login');
    }
}

function updateSlug() {
    const nome = document.getElementById('nome-salao').value;
    const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    document.getElementById('slug-text').innerText = slug || "...";
    return slug;
}

async function finalizarCadastro() {
    // REVALIDAÇÃO DA BARREIRA NO CLIQUE
    if (!planoEscolhido || planoEscolhido === 'conecta-facil') {
        showStep('step-planos');
        return;
    }

    const nomeFantasia = document.getElementById('nome-salao').value;
    const slug = updateSlug();

    if (!nomeFantasia || !slug) return alert('Por favor, digite o nome do seu negócio.');

    try {
        const { error } = await supabaseClient.from('estabelecimentos').insert([{
            dono_id: userLogado.id,
            nome_fantasia: nomeFantasia,
            slug: slug,
            plano_ativo: planoEscolhido,
            status_pagamento: 'trial'
        }]);

        if (error) throw error;
        localStorage.removeItem('plano_mercuria');
        window.location.href = `agenda.html?s=${slug}&u=dono`;
    } catch (err) {
        alert('Erro ao criar sistema: ' + err.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
