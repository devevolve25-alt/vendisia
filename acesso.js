const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuração Global de Segurança - correcao iao
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
        showStep('step-cadastro');
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
            // BARREIRA DE ENTRADA: Se logado sem plano, força escolha
            if (!LISTA_PLANOS.includes(planoEscolhido)) {
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
                if (!LISTA_PLANOS.includes(planoEscolhido)) {
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
    if (!LISTA_PLANOS.includes(planoEscolhido)) {
        alert("Por favor, selecione um plano antes de continuar com o Google.");
        showStep('step-planos');
        return;
    }

    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: window.location.origin + window.location.pathname + "?plano=" + planoEscolhido 
        }
    });
}

async function authSenha(tipo) {
    // BARREIRA PARA CADASTRO (Entrar/Login é liberado pelo banco)
    if (tipo === 'signup' && !LISTA_PLANOS.includes(planoEscolhido)) {
        alert("Ação necessária: Selecione um plano antes de criar sua conta.");
        showStep('step-planos');
        return;
    }

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
        verificarEstabelecimento();
    }
}

async function verificarEstabelecimento() {
    try {
        // BARREIRA DE SEGURANÇA: Impede qualquer gravação se o plano for inválido
        if (!LISTA_PLANOS.includes(planoEscolhido)) {
            showStep('step-planos');
            return;
        }

        // 1. Só registra perfil se houver plano validado
        await supabaseClient.from('perfis').upsert([{ 
            id: userLogado.id, 
            email_contato: userLogado.email 
        }], { onConflict: 'id' });

        // 2. Verifica se já possui estabelecimento
        const { data } = await supabaseClient.from('estabelecimentos')
            .select('slug')
            .eq('dono_id', userLogado.id)
            .maybeSingle();

        if (data) {
            window.location.href = `agenda.html?s=${data.slug}&u=dono`;
        } else {
            // Se não tem salão, libera o formulário de cadastro
            showStep('step-cadastro');
        }
    } catch (err) {
        console.error("Erro na verificação:", err);
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
    // REVALIDAÇÃO FINAL
    if (!LISTA_PLANOS.includes(planoEscolhido)) {
        alert("Selecione um plano válido.");
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
