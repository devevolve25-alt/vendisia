const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuração Global de Segurança - correcao iao - 2
const LISTA_PLANOS = ['conecta-facil', 'agenda-pro', 'gestao-total'];
let userLogado = null;
const urlParams = new URLSearchParams(window.location.search);
let planoEscolhido = urlParams.get('plano') || localStorage.getItem('plano_mercuria');

function showStep(stepId) {
    document.getElementById('step-loading').classList.remove('active');
    document.getElementById('step-login').classList.remove('active');
    document.getElementById('step-cadastro').classList.remove('active');
    document.getElementById('step-planos').classList.remove('active');
    document.getElementById(stepId).classList.add('active');
}

// --- Seleção de Plano ---
function selecionarPlano(idPlano) {
    if (!LISTA_PLANOS.includes(idPlano)) {
        alert("Plano inválido selecionado.");
        showStep('step-planos');
        return;
    }

    planoEscolhido = idPlano;
    localStorage.setItem('plano_mercuria', idPlano);

    // Atualiza URL para persistência
    const novaUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?plano=' + idPlano;
    window.history.pushState({ path: novaUrl }, '', novaUrl);
    
    if (userLogado) {
        // Se o usuário está logado e seleciona um plano, verifica o estabelecimento.
        // A lógica dentro de verificarEstabelecimento determinará se ele vai para cadastro ou já possui um.
        verificarEstabelecimento(); 
    } else {
        alert("Plano selecionado! Agora finalize sua conta.");
        showStep('step-login');
    }
}

async function init() {
    try {
        const params = new URLSearchParams(window.location.search);
        const planoNaUrl = params.get('plano');

        if (LISTA_PLANOS.includes(planoNaUrl)) {
            planoEscolhido = planoNaUrl;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            userLogado = session.user;
            // CORREÇÃO: Removida a barreira de plano inicial para usuários já logados via sessão.
            // A verificação de estabelecimento será feita, e a necessidade de plano
            // será avaliada *somente se* ele precisar criar um novo estabelecimento.
            verificarEstabelecimento();
        } else {
            showStep('step-login');
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                userLogado = session.user;
                // CORREÇÃO: Removida a barreira de plano para o evento de SIGNED_IN.
                // A lógica de plano agora é gerenciada por verificarEstabelecimento()
                // apenas se um novo estabelecimento precisar ser criado.
                verificarEstabelecimento();
            }
        });
    } catch (err) {
        console.error("Erro ao iniciar:", err);
        showStep('step-login');
    }
}

async function loginGoogle() {
    // CORREÇÃO IAO: Removida a validação de plano aqui.
    // A necessidade de um plano para a criação de um novo estabelecimento
    // é gerenciada de forma mais eficaz e no momento correto pela função
    // verificarEstabelecimento(), após o login bem-sucedido.
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: window.location.origin + window.location.pathname + (planoEscolhido ? "?plano=" + planoEscolhido : "") 
        }
    });
}

async function authSenha(tipo) {
    // BARREIRA PARA CADASTRO (signup) permanece:
    // Um NOVO cadastro SEMPRE exige um plano pré-selecionado para criação do sistema.
    if (tipo === 'signup' && !LISTA_PLANOS.includes(planoEscolhido)) {
        alert("Ação necessária: Selecione um plano antes de criar sua conta.");
        showStep('step-planos');
        return;
    }
    // Para 'login', esta barreira é ignorada, permitindo o acesso direto para verificarEstabelecimento().

    const email = document.getElementById('email-acesso').value;
    const password = document.getElementById('senha-acesso').value;

    if (!email || !password) return alert("Preencha e-mail e senha.");
    
    showStep('step-loading');
    
    const { data, error } = (tipo === 'signup') 
        ? await supabaseClient.auth.signUp({ email, password }) 
        : await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Erro: " + error.message);
        showStep('step-login');
    } else if (data.user) {
        userLogado = data.user;
        verificarEstabelecimento(); // Usuário logado ou cadastrado, prossegue para verificar o estabelecimento.
    }
}

async function verificarEstabelecimento() {
    try {
        // CORREÇÃO: Removida a barreira de plano incondicional do início desta função.
        // A necessidade de um plano é agora avaliada APENAS se o usuário *não* tiver
        // um estabelecimento existente e precisar criar um novo.

        // 1. Sempre registra/atualiza o perfil do usuário logado.
        await supabaseClient.from('perfis').upsert([{ 
            id: userLogado.id, 
            email_contato: userLogado.email 
        }], { onConflict: 'id' });

        // 2. Verifica se o usuário já possui um estabelecimento associado.
        const { data } = await supabaseClient.from('estabelecimentos')
            .select('slug')
            .eq('dono_id', userLogado.id)
            .maybeSingle();

        if (data) {
            // SE JÁ TEM ESTABELECIMENTO: Redireciona diretamente para o sistema existente.
            window.location.href = `agenda.html?s=${data.slug}&u=dono`;
        } else {
            // SE NÃO TEM ESTABELECIMENTO: O usuário precisa criar um novo.
            // *Neste ponto*, e somente aqui, verificamos se um plano foi selecionado
            // para que o novo negócio possa ser criado.
            if (!LISTA_PLANOS.includes(planoEscolhido)) {
                // Se o usuário não tem estabelecimento E ainda não selecionou um plano válido,
                // então ele é direcionado para a seleção de planos.
                showStep('step-planos');
            } else {
                // Se não tem estabelecimento, mas um plano válido está selecionado,
                // permite que o usuário prossiga para o formulário de cadastro do novo negócio.
                showStep('step-cadastro');
            }
        }
    } catch (err) {
        console.error("Erro na verificação de estabelecimento:", err);
        showStep('step-login'); // Em caso de erro grave, volta para o login.
    }
}

function updateSlug() {
    const nome = document.getElementById('nome-salao').value;
    const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    document.getElementById('slug-text').innerText = slug || "...";
    return slug;
}

async function finalizarCadastro() {
    // REVALIDAÇÃO FINAL: Esta barreira é vital aqui, pois é o ponto onde o estabelecimento é realmente criado.
    // É a última chance de garantir que um plano válido seja associado à criação de um novo negócio.
    if (!LISTA_PLANOS.includes(planoEscolhido)) {
        alert("Selecione um plano válido antes de criar seu sistema.");
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
