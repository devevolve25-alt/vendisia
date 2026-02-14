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

// --- NOVA FUNÇÃO: Selecionar plano na própria página e liberar trava ---
function selecionarPlano(idPlano) {
    // 1. Salva a escolha do plano
    planoEscolhido = idPlano;
    localStorage.setItem('plano_mercuria', idPlano);
    
    // 2. Verifica se o usuário já está autenticado
    if (userLogado) {
        // Se já estiver logado (ex: via Google ou sessão ativa), vai para o nome do salão
        showStep('step-cadastro');
    } else {
        // Se NÃO estiver logado, obriga a passar pela criação de conta primeiro
        alert("Plano selecionado! Agora crie sua conta para continuar.");
        showStep('step-login');
    }
}

async function init() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            userLogado = session.user;
            verificarEstabelecimento();
        } else {
            showStep('step-login');
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                userLogado = session.user;
                verificarEstabelecimento();
            }
        });
    } catch (err) {
        console.error("Erro ao iniciar:", err);
        showStep('step-login');
    }
}

async function loginGoogle() {
    if (!planoEscolhido || planoEscolhido === 'conecta-facil') {
        alert("Selecione um plano antes de continuar com o Google.");
        showStep('step-planos');
        return;
    }
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname + "?plano=" + planoEscolhido }
    });
}

async function authSenha(tipo) {
    // SE FOR CADASTRO: Verifica se o usuário já escolheu um plano
    if (tipo === 'signup') {
        if (!planoEscolhido || planoEscolhido === 'conecta-facil') {
            alert("Por favor, selecione um plano antes de criar sua conta.");
            showStep('step-planos'); // Força a escolha do plano
            return; // INTERROMPE A CRIAÇÃO DO USUÁRIO NO BD
        }
    }

    const email = document.getElementById('email-acesso').value;
    const password = document.getElementById('senha-acesso').value;

    if (!email || !password) return alert("Preencha e-mail e senha.");
    if (password.length < 6) return alert("A senha deve ter no mínimo 6 caracteres.");

    showStep('step-loading');

    let resultado;
    if (tipo === 'signup') {
        resultado = await supabaseClient.auth.signUp({ email, password });
    } else {
        resultado = await supabaseClient.auth.signInWithPassword({ email, password });
    }

    if (resultado.error) {
        alert("Erro: " + resultado.error.message);
        showStep('step-login');
    }
    // Se for sucesso, o onAuthStateChange cuidará do restante
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
