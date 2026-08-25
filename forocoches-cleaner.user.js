// ==UserScript==
// @name         ForoCoches Cleaner - Ignorados y filtro +18
// @namespace    local.forocoches.ignorefilter
// @version      0.5.0
// @description  Oculta hilos y mensajes de usuarios ignorados y permite filtrar opcionalmente hilos marcados con +18.
// @author       Local
// @match        https://forocoches.com/foro/*
// @match        https://www.forocoches.com/foro/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = Object.freeze({
        cacheKey: 'fcif.ignore-cache.v2',
        adultFilterKey: 'fcif.hide-plus18.v1',
        cacheTtlMs: 30 * 60 * 1000,
        debug: true,
        minimumAuthorCoverage: 0.80,
    });

    const PREFIX = '[FC Ignore Filter]';

    function log(...args) {
        if (CONFIG.debug) {
            console.info(PREFIX, ...args);
        }
    }

    function warn(...args) {
        console.warn(PREFIX, ...args);
    }

    function domReady() {
        if (document.readyState === 'loading') {
            return new Promise((resolve) => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            });
        }

        return Promise.resolve();
    }

    function normalizedPathname() {
        // Algunos enlaces internos/compartidos de ForoCoches pueden contener
        // barras duplicadas, p. ej. /foro//showthread.php. Para el router del
        // userscript ambas formas deben ser equivalentes.
        return location.pathname.replace(/\/{2,}/g, '/');
    }

    function isForumDisplayPage() {
        return /\/foro\/forumdisplay\.php\/?$/i.test(normalizedPathname());
    }

    function isShowThreadPage() {
        return /\/foro\/showthread\.php\/?$/i.test(normalizedPathname());
    }

    function isIgnoreListPage() {
        return /\/foro\/profile\.php\/?$/i.test(normalizedPathname())
            && new URLSearchParams(location.search).get('do') === 'ignorelist';
    }

    function extractUserId(value) {
        if (!value) {
            return null;
        }

        const match = String(value).match(/[?&]u=(\d+)/i);

        return match ? match[1] : null;
    }

    function extractThreadId(titleElement) {
        const match = titleElement?.id?.match(/^thread_title_(\d+)$/);

        return match ? match[1] : null;
    }

    function extractPostId(postElement) {
        const match = postElement?.id?.match(/^edit(\d+)$/);

        return match ? match[1] : null;
    }

    function normalizeUsername(value) {
        return String(value ?? '')
            .normalize('NFC')
            .trim()
            .toLocaleLowerCase('es-ES');
    }

    function isAdultFilterEnabled() {
        return GM_getValue(CONFIG.adultFilterKey, false) === true;
    }

    function setAdultFilterEnabled(enabled) {
        GM_setValue(CONFIG.adultFilterKey, enabled === true);
    }

    function hasPlus18Marker(title) {
        // Detecta el marcador literal +18 en cualquier posición:
        // "Tema +18", "Tema [+18]", "Tema(+18)", "Tema+18..."
        // Evita falsos positivos obvios como "+180".
        return /\+18(?!\d)/u.test(String(title ?? ''));
    }

    function getCurrentUserId(doc = document) {
        const selectors = [
            '#user-profile-menu a.user-profile-menu-header[href*="member.php?u="]',
            '#usercptools_menu a[href*="member.php?u="]',
            'a.user-profile-menu-header[href*="member.php?u="]',
        ];

        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            const userId = extractUserId(element?.getAttribute('href'));

            if (userId) {
                return userId;
            }
        }

        return null;
    }

    function parseIgnoredUsers(doc) {
        const ignoreList = doc.querySelector('#ignorelist');

        if (!ignoreList) {
            throw new Error('No se encontró #ignorelist en la respuesta de ForoCoches.');
        }

        const usersById = new Map();

        for (const item of ignoreList.querySelectorAll('li')) {
            const checkbox = item.querySelector(
                'input[type="checkbox"][name^="listbits[ignore]"][value]'
            );
            const link = item.querySelector('a[href*="member.php?u="]');

            if (!checkbox || !checkbox.checked || !link) {
                continue;
            }

            const id = /^\d+$/.test(checkbox.value)
                ? checkbox.value
                : extractUserId(link.getAttribute('href'));

            const name = link.textContent.trim();

            if (!id || !name) {
                continue;
            }

            usersById.set(id, {
                id,
                name,
                key: normalizeUsername(name),
            });
        }

        if (usersById.size === 0) {
            // Una lista vacía puede ser válida, pero si existen <li> y no pudimos
            // parsear ninguno preferimos tratarlo como cambio de contrato.
            if (ignoreList.querySelector('li')) {
                throw new Error(
                    'La lista de ignorados contiene usuarios pero no se pudieron interpretar.'
                );
            }
        }

        return [...usersById.values()];
    }

    function readCache(currentUserId) {
        if (!currentUserId) {
            return null;
        }

        const cache = GM_getValue(CONFIG.cacheKey, null);

        if (!cache || cache.version !== 2) {
            return null;
        }

        if (cache.userId !== currentUserId) {
            return null;
        }

        if (!Number.isFinite(cache.fetchedAt)) {
            return null;
        }

        if ((Date.now() - cache.fetchedAt) > CONFIG.cacheTtlMs) {
            return null;
        }

        if (!Array.isArray(cache.users)) {
            return null;
        }

        return cache.users.filter((user) =>
            user
            && /^\d+$/.test(String(user.id))
            && typeof user.name === 'string'
            && typeof user.key === 'string'
        );
    }

    function writeCache(userId, users) {
        if (!userId) {
            return;
        }

        GM_setValue(CONFIG.cacheKey, {
            version: 2,
            userId,
            fetchedAt: Date.now(),
            users,
        });
    }

    async function fetchIgnoredUsers(currentUserId) {
        const url = new URL('/foro/profile.php', location.origin);
        url.searchParams.set('do', 'ignorelist');

        const response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'follow',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
            },
        });

        if (!response.ok) {
            throw new Error(`La lista de ignorados respondió HTTP ${response.status}.`);
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const users = parseIgnoredUsers(doc);
        const responseUserId = getCurrentUserId(doc);

        if (currentUserId && responseUserId && currentUserId !== responseUserId) {
            throw new Error('La identidad de sesión no coincide al cargar los ignorados.');
        }

        const effectiveUserId = currentUserId || responseUserId;

        if (!effectiveUserId) {
            throw new Error('No se pudo identificar al usuario autenticado.');
        }

        writeCache(effectiveUserId, users);

        return users;
    }

    async function getIgnoredUsers({ forceRefresh = false } = {}) {
        const currentUserId = getCurrentUserId();

        if (!currentUserId) {
            throw new Error('No se pudo identificar al usuario actual.');
        }

        if (!forceRefresh) {
            const cached = readCache(currentUserId);

            if (cached) {
                log(`Lista de ignorados cargada desde caché: ${cached.length} usuarios.`);
                return cached;
            }
        }

        const users = await fetchIgnoredUsers(currentUserId);
        log(`Lista de ignorados actualizada: ${users.length} usuarios.`);

        return users;
    }

    function findModernThreadBlock(titleElement) {
        const section = titleElement.closest(
            'section.without-top-corners.without-bottom-corners'
        );

        if (!section) {
            return null;
        }

        let block = titleElement;

        while (block.parentElement && block.parentElement !== section) {
            block = block.parentElement;
        }

        return block.parentElement === section ? block : null;
    }

    function extractStarterUsername(block) {
        if (!block) {
            return null;
        }

        // En el diseño moderno el nombre que precede a "Actualizado" es el
        // creador del hilo. El enlace que lo envuelve puede apuntar al último
        // mensaje, por lo que NO usamos el href para deducir el autor.
        for (const span of block.querySelectorAll('span')) {
            const text = span.textContent.trim();

            if (!text.startsWith('@')) {
                continue;
            }

            const match = text.match(/^@(.+?)\s+-\s+Actualizado(?:\s|$)/iu);

            if (match) {
                return match[1].trim();
            }
        }

        return null;
    }

    function hideThreadBlock(block) {
        if (!block) {
            return false;
        }

        const separator = block.nextElementSibling;

        block.dataset.fcifHidden = '1';
        block.style.setProperty('display', 'none', 'important');

        if (separator && separator.tagName.toLowerCase() === 'separator') {
            separator.dataset.fcifHidden = '1';
            separator.style.setProperty('display', 'none', 'important');
        }

        return true;
    }

    function clearPreviousFiltering() {
        for (const element of document.querySelectorAll('[data-fcif-hidden="1"]')) {
            element.style.removeProperty('display');
            delete element.dataset.fcifHidden;
        }
    }

    function inspectModernThreads() {
        const titles = Array.from(
            document.querySelectorAll('a[id^="thread_title_"]')
        ).filter((element) => extractThreadId(element));

        const threads = [];

        for (const title of titles) {
            const block = findModernThreadBlock(title);
            const starterName = extractStarterUsername(block);

            threads.push({
                threadId: extractThreadId(title),
                title: title.textContent.trim(),
                starterName,
                starterKey: starterName ? normalizeUsername(starterName) : null,
                block,
            });
        }

        return threads;
    }

    async function filterForumDisplay({ forceRefresh = false } = {}) {
        clearPreviousFiltering();

        const threads = inspectModernThreads();

        if (threads.length === 0) {
            warn('No se encontraron hilos del diseño nuevo. No se modifica la página.');
            return;
        }

        const mapped = threads.filter((thread) => thread.starterKey);
        const coverage = mapped.length / threads.length;

        if (coverage < CONFIG.minimumAuthorCoverage) {
            throw new Error(
                `Solo se identificó el autor de ${mapped.length}/${threads.length} hilos; ` +
                'se cancela el filtrado para evitar falsos positivos.'
            );
        }

        const ignoredUsers = await getIgnoredUsers({ forceRefresh });
        const ignoredKeys = new Set(ignoredUsers.map((user) => user.key));
        const plus18Enabled = isAdultFilterEnabled();

        let hidden = 0;
        let hiddenByIgnored = 0;
        let hiddenByPlus18 = 0;

        for (const thread of mapped) {
            const ignoredMatch = ignoredKeys.has(thread.starterKey);
            const plus18Match = plus18Enabled && hasPlus18Marker(thread.title);

            if (!ignoredMatch && !plus18Match) {
                continue;
            }

            if (hideThreadBlock(thread.block)) {
                hidden += 1;

                if (ignoredMatch) {
                    hiddenByIgnored += 1;
                }

                if (plus18Match) {
                    hiddenByPlus18 += 1;
                }

                const reasons = [];

                if (ignoredMatch) {
                    reasons.push('usuario ignorado');
                }

                if (plus18Match) {
                    reasons.push('+18');
                }

                log(
                    `Ocultado hilo ${thread.threadId}: "${thread.title}" ` +
                    `(autor: ${thread.starterName}; motivo: ${reasons.join(' + ')}).`
                );
            }
        }

        log(
            `Analizados ${threads.length} hilos; ` +
            `${mapped.length} autores identificados; ${hidden} ocultados ` +
            `(${hiddenByIgnored} por ignorados, ${hiddenByPlus18} por +18). ` +
            `Filtro +18: ${plus18Enabled ? 'activado' : 'desactivado'}.`
        );
    }

    function extractPostAuthor(postElement) {
        const postId = extractPostId(postElement);

        if (!postId) {
            return null;
        }

        // Mensaje normal: el bloque de cabecera contiene postmenu_{postId}
        // y el enlace de autor apunta directamente a member.php?u={userId}.
        const postbit = postElement.querySelector(`#post${postId}.postbit_wrapper`);

        if (postbit) {
            const authorLink = postbit.querySelector(
                `#postmenu_${postId} a[href*="member.php?u="]`
            );

            const userId = extractUserId(authorLink?.getAttribute('href'));

            if (userId) {
                return {
                    id: userId,
                    name: authorLink.textContent.trim(),
                };
            }

            return null;
        }

        // Mensaje que ForoCoches ya ha sustituido por su aviso de "ignorado".
        // Aquí no existe postbit_wrapper, pero el autor sigue presente en la
        // cabecera inmediata del <section>.
        const section = postElement.querySelector(':scope > section');
        const header = section?.querySelector(':scope > div > div:first-child');
        const authorLink = header?.querySelector(':scope > a[href*="member.php?u="]');
        const userId = extractUserId(authorLink?.getAttribute('href'));

        if (!userId) {
            return null;
        }

        return {
            id: userId,
            name: authorLink.textContent.trim(),
        };
    }

    function inspectThreadPosts() {
        const postsContainer = document.querySelector('#posts');

        if (!postsContainer) {
            return [];
        }

        const postElements = Array.from(postsContainer.children).filter((element) =>
            /^edit\d+$/.test(element.id || '')
        );

        return postElements.map((element) => {
            const author = extractPostAuthor(element);

            return {
                postId: extractPostId(element),
                authorId: author?.id ?? null,
                authorName: author?.name ?? '',
                element,
            };
        });
    }

    function hidePost(post) {
        if (!post?.element) {
            return false;
        }

        // El wrapper edit{post_id} contiene el post completo y su
        // <separator-large>, por lo que no queda ningún hueco visual.
        post.element.dataset.fcifHidden = '1';
        post.element.style.setProperty('display', 'none', 'important');

        return true;
    }

    async function filterShowThread({ forceRefresh = false } = {}) {
        clearPreviousFiltering();

        const posts = inspectThreadPosts();

        if (posts.length === 0) {
            warn('No se encontraron mensajes en #posts. No se modifica la página.');
            return;
        }

        const ignoredUsers = await getIgnoredUsers({ forceRefresh });
        const ignoredIds = new Set(ignoredUsers.map((user) => String(user.id)));

        let identified = 0;
        let hidden = 0;

        for (const post of posts) {
            if (!post.authorId) {
                continue;
            }

            identified += 1;

            if (!ignoredIds.has(post.authorId)) {
                continue;
            }

            if (hidePost(post)) {
                hidden += 1;
                log(
                    `Ocultado mensaje ${post.postId} ` +
                    `(autor: ${post.authorName || `u=${post.authorId}`}).`
                );
            }
        }

        log(
            `Analizados ${posts.length} mensajes; ` +
            `${identified} autores identificados por ID; ${hidden} ocultados.`
        );
    }

    async function syncCacheFromIgnoreListPage() {
        const userId = getCurrentUserId();

        if (!userId) {
            return;
        }

        try {
            const users = parseIgnoredUsers(document);
            writeCache(userId, users);
            log(`Caché sincronizada desde la lista de ignorados: ${users.length} usuarios.`);
        } catch (error) {
            warn(error);
        }
    }

    async function toggleAdultFilter() {
        const nextValue = !isAdultFilterEnabled();
        setAdultFilterEnabled(nextValue);

        try {
            await domReady();

            if (isForumDisplayPage()) {
                await filterForumDisplay();
            }
        } catch (error) {
            warn('No se pudo volver a filtrar tras cambiar +18:', error);
        }

        alert(
            `${PREFIX} Filtro de títulos +18 ${nextValue ? 'ACTIVADO' : 'DESACTIVADO'}.`
        );
    }

    async function manualRefresh() {
        try {
            await domReady();

            if (isForumDisplayPage()) {
                await filterForumDisplay({ forceRefresh: true });
                return;
            }

            if (isShowThreadPage()) {
                await filterShowThread({ forceRefresh: true });
                return;
            }

            const users = await getIgnoredUsers({ forceRefresh: true });
            alert(`${PREFIX} Lista actualizada: ${users.length} usuarios ignorados.`);
        } catch (error) {
            warn('Actualización manual cancelada:', error);
            alert(`${PREFIX} No se pudo actualizar. Revisa la consola.`);
        }
    }

    GM_registerMenuCommand(
        'ForoCoches: actualizar ignorados y volver a filtrar',
        manualRefresh
    );

    GM_registerMenuCommand(
        `ForoCoches: ${isAdultFilterEnabled() ? 'desactivar' : 'activar'} filtro +18`,
        toggleAdultFilter
    );

    GM_registerMenuCommand(
        'ForoCoches: borrar caché del filtro',
        () => {
            GM_deleteValue(CONFIG.cacheKey);
            alert(`${PREFIX} Caché borrada.`);
        }
    );

    (async () => {
        await domReady();

        if (isIgnoreListPage()) {
            await syncCacheFromIgnoreListPage();
            return;
        }

        if (!isForumDisplayPage() && !isShowThreadPage()) {
            return;
        }

        try {
            if (isForumDisplayPage()) {
                await filterForumDisplay();
                return;
            }

            if (isShowThreadPage()) {
                await filterShowThread();
            }
        } catch (error) {
            // Fail-safe: si cambia el HTML, dejamos la página intacta.
            clearPreviousFiltering();
            warn('Filtrado cancelado de forma segura:', error);
        }
    })();
})();
