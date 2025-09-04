// --- CONSTANTES DE ESTILO E CONFIGURAÇÃO ---
const typeColors = {
    grass: '#22c55e', fire: '#ef4444', water: '#3b82f6',
    electric: '#facc15', psychic: '#a855f7', ice: '#67e8f9',
    rock: '#b45309', ground: '#d97706', normal: '#9ca3af',
    fighting: '#f97316', flying: '#818cf8', ghost: '#3730a3',
    bug: '#84cc16', dragon: '#7c3aed', steel: '#64748b',
    fairy: '#f472b6', dark: '#5b546e', poison: '#8f41b9',
    default: '#d1d5db'
};
const API_BASE_URL = 'http://localhost:3000/api';
const MAX_BASE_STAT = 180; // Valor de base para calcular a % da barra de status

// --- VARIÁVEIS GLOBAIS ---
let mapPolygonSeries;
let countryBiomeData = {};
let debounceTimer;

// --- ELEMENTOS DO DOM ---
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const suggestionsBox = document.getElementById('suggestions-box');
const searchModeRadios = document.querySelectorAll('input[name="search-mode"]');
const initialStateDiv = document.getElementById('initial-state');
const loaderDiv = document.getElementById('loader');
const errorDiv = document.getElementById('error-message');
const resultsContentDiv = document.getElementById('results-content');
const mapLoader = document.getElementById('map-loader');

// --- FUNÇÕES AUXILIARES ---
const getTypeColor = (type) => typeColors[type] || typeColors['default'];
const hideAllPanels = () => { initialStateDiv.style.display = 'none'; errorDiv.classList.add('hidden'); resultsContentDiv.classList.add('hidden'); };
const displayError = (message) => { hideAllPanels(); errorDiv.textContent = message; errorDiv.classList.remove('hidden'); };
const createAndAppend = (tag, parent, options = {}) => {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.textContent) element.textContent = options.textContent;
    if (options.id) element.id = options.id;
    if (options.src) element.src = options.src;
    if (options.alt) element.alt = options.alt;
    if (options.style) {
        Object.assign(element.style, options.style);
    }
    parent.append(element);
    return element;
};


// --- LÓGICA DO MAPA (amCharts) ---
async function initializeMap() {
    try {
        const response = await fetch(`${API_BASE_URL}/country-biomes`);
        if (!response.ok) throw new Error((await response.json()).error);
        countryBiomeData = await response.json();
    } catch (error) {
        mapLoader.style.display = 'none';
        displayError("Falha ao conectar ao servidor. Verifique se o backend está a correr e recarregue a página.");
        return;
    }

    am5.ready(function () {
        mapLoader.style.display = 'none';
        let root = am5.Root.new("world-map");
        root.setThemes([am5themes_Animated.new(root)]);

        let chart = root.container.children.push(am5map.MapChart.new(root, { panX: "rotateX", panY: "translateY", projection: am5map.geoMercator() }));
        chart.set("zoomControl", am5map.ZoomControl.new(root, {}));

        mapPolygonSeries = chart.series.push(am5map.MapPolygonSeries.new(root, { geoJSON: am5geodata_worldLow, exclude: ["AQ"], field: "id" }));
        
        resetMapToBiomes();

        mapPolygonSeries.mapPolygons.template.setAll({ tooltipText: "", toggleKey: "active", interactive: true });
        mapPolygonSeries.mapPolygons.template.adapters.add("fill", (fill, target) => target.dataItem.dataContext.fill || am5.color(getTypeColor('default')));
        mapPolygonSeries.mapPolygons.template.adapters.add("tooltipText", (text, target) => {
            const country = countryBiomeData[target.dataItem.get("id")];
            return country ? `[bold]${country.name}[/]\nBioma: ${country.type}` : `[bold]${target.dataItem.get("id")}[/]\n(Bioma não definido)`;
        });

        mapPolygonSeries.mapPolygons.template.events.on("click", (ev) => {
            const countryId = ev.target.dataItem.get("id");
            if (countryId) fetchAndDisplayCountryInfo(countryId);
        });
        mapPolygonSeries.mapPolygons.template.states.create("hover", { fillOpacity: 0.7 });
    });
}

// --- LÓGICA DE EXIBIÇÃO ---
async function fetchAndDisplayCountryInfo(countryCode) {
    // Esta função foi mantida com innerHTML por ser mais simples e ter menos risco,
    // mas poderia ser refatorada como as outras se desejado.
    hideAllPanels();
    loaderDiv.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/country-info/${countryCode}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        let weatherHtml = `<p class="text-sm text-gray-500">Não foi possível obter o clima.</p>`;
        if (data.weather) {
            let eventHtml = '';
            if (data.weather.eventType) {
                const color = getTypeColor(data.weather.eventType);
                eventHtml = `
                        <div style="margin-top: 0.5rem; text-align: center;">
                            <p style="font-size: 0.875rem; font-weight: 600;">Evento Climático:</p>
                            <span class="type-badge" style="background-color: ${color};">${data.weather.eventType}</span>
                        </div>`;
            }
            weatherHtml = `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                        <img src="${data.weather.icon}" alt="${data.weather.condition}" style="width: 48px; height: 48px;">
                        <div>
                            <p style="font-weight: 700; font-size: 1.25rem;">${data.weather.temp}</p>
                            <p style="font-size: 0.875rem; text-transform: capitalize;">${data.weather.condition}</p>
                        </div>
                    </div>
                    ${eventHtml}`;
        }
        
        const baseColor = getTypeColor(data.baseType);
        resultsContentDiv.innerHTML = `
            <h2>${data.name}</h2>
            <div style="text-align: center; margin-bottom: 1rem;">
                <p style="font-size: 0.875rem; font-weight: 600;">Bioma Base:</p>
                <span class="type-badge" style="background-color: ${baseColor};">${data.baseType}</span>
            </div>
            <hr style="margin: 0.75rem 0;">
            <h3 style="font-weight: 600; text-align: center; margin-bottom: 0.5rem;">Clima Atual em ${data.capital}</h3>
            ${weatherHtml}`;
    } catch (error) {
        displayError(error.message);
    } finally {
        loaderDiv.classList.add('hidden');
        resultsContentDiv.classList.remove('hidden');
    }
}

function resetMapToBiomes() {
    if (!mapPolygonSeries) return;
    const mapData = Object.entries(countryBiomeData).map(([id, data]) => ({
        id,
        name: data.name,
        type: data.type,
        fill: am5.color(getTypeColor(data.type))
    }));
    mapPolygonSeries.data.setAll(mapData);
}

function displayPokemonResults(data) {
    const highlightFill = am5.color(getTypeColor(data.types[0]));
    const newMapData = Object.entries(countryBiomeData).map(([id, countryData]) => ({
        id,
        name: countryData.name,
        type: countryData.type,
        fill: data.countries.some(c => c.code === id) ? highlightFill : am5.color(getTypeColor('default'))
    }));
    mapPolygonSeries.data.setAll(newMapData);

    resultsContentDiv.innerHTML = ''; // Limpa o conteúdo anterior

    // Header
    const header = createAndAppend('div', resultsContentDiv, { style: { textAlign: 'center' } });
    const pokemonImage = createAndAppend('img', header, {
        src: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${data.id}.png`,
        alt: data.name,
        className: 'pokemon-image'
    });
    pokemonImage.onerror = () => { pokemonImage.src = 'https://placehold.co/96x96/e5e7eb/374151?text=?'; };
    createAndAppend('h2', header, { textContent: data.name });
    const typeContainer = createAndAppend('div', header, { className: 'type-badge-container' });
    data.types.forEach(type => createAndAppend('span', typeContainer, {
        className: 'type-badge',
        textContent: type,
        style: { backgroundColor: getTypeColor(type) }
    }));

    // Height & Weight
    const physicalStats = createAndAppend('div', resultsContentDiv, { className: 'pokemon-stats' });
    const heightItem = createAndAppend('div', physicalStats, { className: 'stat-item' });
    createAndAppend('h4', heightItem, { textContent: 'Altura' });
    createAndAppend('p', heightItem, { textContent: `${data.height} m` });
    const weightItem = createAndAppend('div', physicalStats, { className: 'stat-item' });
    createAndAppend('h4', weightItem, { textContent: 'Peso' });
    createAndAppend('p', weightItem, { textContent: `${data.weight} kg` });

    // Description
    createAndAppend('p', resultsContentDiv, { className: 'pokemon-description', textContent: data.description });

    // Base Stats
    const statsSection = createAndAppend('div', resultsContentDiv);
    createAndAppend('h3', statsSection, { className: 'section-title', textContent: 'Atributos Base' });
    const statsGrid = createAndAppend('div', statsSection, { className: 'stats-grid' });
    Object.entries(data.stats).forEach(([statName, value]) => {
        const statItemContainer = createAndAppend('div', statsGrid);
        createAndAppend('span', statItemContainer, { className: 'stat-name', textContent: statName.replace('-', ' ') });
        const statBar = createAndAppend('div', statItemContainer, { className: 'stat-bar' });
        createAndAppend('div', statBar, {
            className: 'stat-bar-inner',
            style: { width: `${Math.min((value / MAX_BASE_STAT) * 100, 100)}%` }
        });
    });

    // Abilities
    const abilitiesSection = createAndAppend('div', resultsContentDiv);
    createAndAppend('h3', abilitiesSection, { className: 'section-title', textContent: 'Habilidades' });
    const abilitiesList = createAndAppend('ul', abilitiesSection, { className: 'abilities-list' });
    data.abilities.forEach(ability => createAndAppend('li', abilitiesList, { textContent: ability }));

    // Top Regions
    const regionsSection = createAndAppend('div', resultsContentDiv);
    createAndAppend('h3', regionsSection, { className: 'section-title', textContent: 'Top 3 Regiões' });
    const countryGrid = createAndAppend('div', regionsSection, { className: 'country-grid' });
    if (data.countries.length > 0) {
        data.countries.forEach(country => {
            const countryCard = createAndAppend('div', countryGrid, { className: 'country-card' });
            createAndAppend('img', countryCard, { src: country.flag, alt: `Bandeira de ${country.name}`, className: 'country-flag' });
            createAndAppend('span', countryCard, { className: 'country-name', textContent: country.name });
        });
    } else {
        countryGrid.textContent = 'Nenhuma região principal encontrada.';
    }

    // Reset Button
    createAndAppend('button', resultsContentDiv, { id: 'reset-button', textContent: 'Resetar Mapa' });

    resultsContentDiv.classList.remove('hidden');
}


function displayCountryResults(data) {
    if (!data || !data.country) return;

    let searchCode = null;

    if (data.country.code && typeof data.country.code === "string") {
        searchCode = data.country.code.toUpperCase().slice(0, 2);
    } else if (data.country.name) {
        mapPolygonSeries.mapPolygons.each(polygon => {
            const polygonName = polygon.dataItem.dataContext.name;
            const polygonId = polygon.dataItem.dataContext.id;
            if (polygonName && polygonName.toLowerCase() === data.country.name.toLowerCase()) {
                searchCode = polygonId;
            }
        });
    }

    console.log("Data recebido:", data);
    console.log("Código ISO usado no mapa:", searchCode);

    if (!searchCode) {
        console.warn("Nenhum código de país válido encontrado!");
        // Opcional: mostrar um erro para o usuário
        displayError(`Não foi possível encontrar o país "${data.country.name}" no mapa.`);
        return;
    }

    // --- CÓDIGO ATUALIZADO ---
    // Recria o conjunto de dados do mapa para garantir consistência
    const highlightFill = am5.color(getTypeColor(data.country.baseType));
    const newMapData = Object.entries(countryBiomeData).map(([id, countryData]) => ({
        id,
        name: countryData.name,
        type: countryData.type,
        // Pinta o país pesquisado com a cor do seu bioma e os outros com a cor padrão
        fill: id === searchCode ? highlightFill : am5.color(getTypeColor('default'))
    }));
    // Define o novo conjunto de dados para a série de polígonos do mapa
    mapPolygonSeries.data.setAll(newMapData);
    // --- FIM DO CÓDIGO ATUALIZADO ---

    resultsContentDiv.innerHTML = '';

    // Header
    const header = createAndAppend('div', resultsContentDiv, { style: { textAlign: 'center' } });
    createAndAppend('img', header, {
        src: data.country.flag,
        alt: `Bandeira de ${data.country.name}`,
        className: 'pokemon-image',
        style: { width: '96px', height: '64px', objectFit: 'cover' }
    });
    createAndAppend('h2', header, { textContent: data.country.name });
    const typeContainer = createAndAppend('div', header, { className: 'type-badge-container' });
    createAndAppend('span', typeContainer, {
        className: 'type-badge',
        textContent: data.country.baseType,
        style: { backgroundColor: getTypeColor(data.country.baseType) }
    });

    // Pokémon Section
    const pokemonSection = createAndAppend('div', resultsContentDiv);
    createAndAppend('h3', pokemonSection, { className: 'section-title', textContent: 'Pokémon Comuns na Região' });
    const pokemonGrid = createAndAppend('div', pokemonSection, { className: 'country-pokemon-grid' });
    data.pokemon.forEach(p => {
        const card = createAndAppend('div', pokemonGrid, { className: 'country-pokemon-card' });
        const img = createAndAppend('img', card, { src: p.imageUrl });
        img.onerror = () => { img.style.display = 'none'; };
        createAndAppend('p', card, { textContent: p.name });
    });

    // Reset Button
    createAndAppend('button', resultsContentDiv, { id: 'reset-button', textContent: 'Resetar Mapa' });

    resultsContentDiv.classList.remove('hidden');
}


// --- LÓGICA DE BUSCA ---
function getSearchMode() {
    return document.querySelector('input[name="search-mode"]:checked').value;
}

async function performSearch(query, code = null) {
    const mode = getSearchMode();
    if (mode === 'pokemon') {
        await searchPokemonByName(query);
    } else {
        if (code) {
            await searchByCountry(code, query);
        } else {
            displayError('Por favor, selecione um país da lista de sugestões.');
        }
    }
}

async function searchPokemonByName(name) {
    hideAllPanels();
    loaderDiv.classList.remove('hidden');
    try {
        const response = await fetch(`${API_BASE_URL}/pokemon-locations?name=${name}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        displayPokemonResults(data);
    } catch (error) {
        resetMapToBiomes();
        displayError(error.message);
    } finally {
        loaderDiv.classList.add('hidden');
    }
}

async function searchByCountry(countryCode) {
    hideAllPanels();
    loaderDiv.classList.remove('hidden');
    try {
        const response = await fetch(`${API_BASE_URL}/pokemon-by-country?countryCode=${countryCode}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        displayCountryResults(data);
    } catch (error) {
        resetMapToBiomes();
        displayError(error.message);
    } finally {
        loaderDiv.classList.add('hidden');
    }
}

// --- LÓGICA DE AUTOCOMPLETE ---
async function handleAutocomplete() {
    const query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
        suggestionsBox.classList.add('hidden');
        return;
    }

    const mode = getSearchMode();
    try {
        const response = await fetch(`${API_BASE_URL}/autocomplete/${mode}?query=${query}`);
        const suggestions = await response.json();
        renderSuggestions(suggestions, query);
    } catch (error) {
        console.error("Erro no autocomplete:", error);
    }
}

function renderSuggestions(suggestions, query) {
    if (suggestions.length === 0) {
        suggestionsBox.classList.add('hidden');
        return;
    }
    
    // Mantido com innerHTML por ser uma lista simples, temporária e de baixa complexidade
    const mode = getSearchMode();
    suggestionsBox.innerHTML = suggestions.map(item => {
        const highlightedName = item.name.replace(new RegExp(`^${query}`, 'i'), `<strong>${query}</strong>`);
        let imageHtml = '';
        if (mode === 'pokemon') {
            const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${item.id}.png`;
            imageHtml = `<img src="${spriteUrl}" class="suggestion-image" alt="${item.name}">`;
        } else {
            imageHtml = `<img src="${item.flag}" class="suggestion-flag" alt="Bandeira de ${item.name}">`;
        }
        return `
            <div class="suggestion-item" data-name="${item.name}" data-code="${item.code || ''}">
                ${imageHtml}
                <span>${highlightedName}</span>
            </div>`;
    }).join('');

    suggestionsBox.classList.remove('hidden');
}

// --- INICIALIZAÇÃO E EVENTOS ---
searchModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        searchInput.placeholder = `Pesquisar ${radio.value}...`;
        searchInput.value = '';
        suggestionsBox.classList.add('hidden');
    });
});

searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleAutocomplete, 300);
});

suggestionsBox.addEventListener('click', (e) => {
    const suggestionItem = e.target.closest('.suggestion-item');
    if (suggestionItem) {
        const name = suggestionItem.dataset.name;
        const code = suggestionItem.dataset.code;
        searchInput.value = name;
        suggestionsBox.classList.add('hidden');
        performSearch(name, code);
    }
});

document.addEventListener("click", (e) => {
    // Se clicar fora do input E fora do suggestionsBox → esconde
    if (
        !searchInput.contains(e.target) &&
        !suggestionsBox.contains(e.target)
    ) {
        suggestionsBox.classList.add("hidden");
    }
});

searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
        const firstSuggestion = suggestionsBox.querySelector('.suggestion-item');
        if (firstSuggestion && firstSuggestion.dataset.name.toLowerCase() === query.toLowerCase()) {
            performSearch(firstSuggestion.dataset.name, firstSuggestion.dataset.code);
        } else if (getSearchMode() === 'pokemon') {
            performSearch(query);
        } else {
            displayError('Por favor, selecione uma opção válida da lista de sugestões.');
        }
        suggestionsBox.classList.add('hidden');
    }
});

// Evento centralizado para o botão de reset
resultsContentDiv.addEventListener('click', (event) => {
    if (event.target.id === 'reset-button') {
        hideAllPanels();
        initialStateDiv.style.display = 'block';
        searchInput.value = '';
        resetMapToBiomes();
    }
});

document.addEventListener('DOMContentLoaded', initializeMap);