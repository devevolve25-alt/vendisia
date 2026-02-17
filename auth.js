// auth.js
// Gerencia a autenticação de usuários.

import { supabaseClient } from './config.js';

/**
 * Realiza o logout do usuário atual e o redireciona.
 * @returns {Promise<void>}
 */
async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error("Erro ao fazer logout:", error.message);
            alert("Erro ao sair: " + error.message);
        } else {
            console.log("Usuário desconectado.");
            // Redireciona o usuário para a página inicial após o logout
            window.location.href = 'https://vendisia.ia.br/';
        }
    } catch (err) {
        console.error("Exceção durante o logout:", err);
        alert("Ocorreu um erro inesperado ao tentar sair.");
    }
}

/**
 * Verifica se há um usuário logado e retorna seus dados.
 * Se não houver, ou se a sessão for inválida, retorna null.
 * @returns {Promise<Object|null>} Os dados do usuário logado ou null.
 */
async function verifyUser() {
    try {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error) {
            console.error("Erro ao verificar usuário:", error.message);
            return null;
        }
        return user;
    } catch (err) {
        console.error("Exceção ao verificar usuário:", err);
        return null;
    }
}

export { logout, verifyUser };
