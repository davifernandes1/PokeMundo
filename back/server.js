// Carrega as variáveis de ambiente do ficheiro .env
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

app.use(cors());


let countryDataCache = null;
let pokemonNameCache = [];


function determinePokemonType(country) {
    const { region, subregion, landlocked, cca2, area, population } = country;
    const populationDensity = population / area; // Pessoas por km²
    if (['JP', 'KR', 'US', 'DE', 'CN', 'IL', 'TW'].includes(cca2)) return 'electric';
    if (['IN', 'GR', 'EG', 'PE', 'IT', 'GB'].includes(cca2)) return 'psychic';
    if (['GL', 'AQ', 'IS', 'SJ', 'NO', 'FI', 'SE'].includes(cca2)) return 'ice';
    if (['SA', 'DZ', 'EG', 'LY', 'IR', 'AU', 'ES'].includes(cca2) || subregion === 'Northern Africa') return 'fire';
    if (['MN', 'CL', 'AU'].includes(cca2) || (region === 'Africa' && populationDensity < 25)) return 'ground';
    if (['CH', 'NP', 'AF', 'ZA'].includes(cca2)) return 'rock';
    if (['BO', 'NP', 'BT'].includes(cca2) || ['id', 'ph'].includes(cca2.toLowerCase())) return 'flying';
    if (['VN', 'BT'].includes(cca2)) return 'dragon'; 
    if (['RO', 'MX', 'PL'].includes(cca2) || (populationDensity < 5 && population > 10000)) return 'ghost';
    if (['IE', 'FR', 'NZ', 'CH', 'AT'].includes(cca2)) return 'fairy';
    if (['BR', 'TH', 'CU'].includes(cca2)) return 'fighting';
    if (['RU', 'BE', 'LU'].includes(cca2)) return 'steel';
    if (['CA'].includes(cca2) || (cca2 === 'RU' && region === 'Asia')) return 'dark';
    if (['AU', 'BR', 'CO', 'IN', 'MY'].includes(cca2)) return 'poison';
    if (['CR', 'MG', 'PG', 'TH'].includes(cca2) || subregion === 'Central America') return 'bug';
    if (['BR', 'CG', 'ID', 'VE'].includes(cca2) || subregion === 'South America') return 'grass';
    if (!landlocked || subregion === 'Caribbean' || subregion === 'Polynesia' || subregion === 'South-Eastern Asia') return 'water';
    return 'normal';
}


async function cacheAllPokemonNames() {
    try {
        console.log('A buscar a lista de todos os Pokémon...');
        const response = await axios.get('https://pokeapi.co/api/v2/pokemon?limit=1302');
        pokemonNameCache = response.data.results.map(p => {
            const urlParts = p.url.split('/');
            const id = urlParts[urlParts.length - 2];
            return { name: p.name, id: id };
        });
        console.log(`${pokemonNameCache.length} nomes de Pokémon carregados.`);
    } catch (error) {
        console.error('Falha ao buscar a lista de Pokémon:', error.message);
    }
}

async function initializeServerData() {
    console.log('A buscar e processar dados dos países...');
    try {
        const response = await axios.get('https://restcountries.com/v3.1/all?fields=name,capital,cca2,region,subregion,landlocked,area,population,flags');
        const allCountries = response.data;
        const processedCountries = {};
        allCountries.forEach(country => {
            if (country.cca2 && country.capital && country.capital.length > 0 && country.area > 0 && country.population) {
                processedCountries[country.cca2] = {
                    name: country.name.common, 
                    capital: country.capital[0],
                    baseType: determinePokemonType(country), 
                    flag: country.flags.svg
                };
            }
        });
        countryDataCache = processedCountries;
        console.log(`Dados dos países carregados! ${Object.keys(processedCountries).length} países processados.`);
    } catch (error) {
        console.error('Falha ao buscar dados dos países:', error.message);
        process.exit(1); 
    }
}


app.get('/api/country-biomes', (req, res) => {
    if(!countryDataCache) return res.status(503).json({error: 'Dados a carregar'});
    const biomeData = Object.entries(countryDataCache).reduce((acc, [code, data]) => {
        acc[code] = { name: data.name, type: data.baseType };
        return acc;
    }, {});
    res.json(biomeData);
});

app.get('/api/country-info/:countryCode', async (req, res) => {
    const { countryCode } = req.params;
    const country = countryDataCache ? countryDataCache[countryCode.toUpperCase()] : null;

    if (!country) return res.status(404).json({ error: 'País não encontrado.' });
    if (!OPENWEATHER_API_KEY) return res.status(500).json({ error: 'Chave da API de clima não configurada.' });

    try {
        const weatherResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
            params: { q: country.capital, appid: OPENWEATHER_API_KEY, units: 'metric', lang: 'pt_br' }
        });
        
        const weather = weatherResponse.data;
        const condition = weather.weather[0].main;
        let eventType = null;
        
        if (['Rain', 'Drizzle'].includes(condition)) eventType = 'water';
        if (condition === 'Thunderstorm') eventType = 'electric';
        if (condition === 'Snow') eventType = 'ice';
        if (condition === 'Clear' && weather.main.temp > 30) eventType = 'fire';

        res.json({ ...country, weather: { temp: `${weather.main.temp.toFixed(1)}°C`, condition: weather.weather[0].description, icon: `https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`, eventType } });
    } catch (error) {
        console.error(`Falha ao buscar clima para ${country.capital}:`, error.message);
        res.json({ ...country, weather: null });
    }
});

app.get('/api/pokemon-locations', async (req, res) => {
    const pokemonName = req.query.name ? req.query.name.toLowerCase() : null;
    if (!pokemonName) return res.status(400).json({ error: 'O nome do Pokémon é obrigatório.' });
    if (!countryDataCache) return res.status(503).json({ error: 'Os dados dos países não estão prontos.' });
    
    try {
        const pokeApiResponse = await axios.get(`https://pokeapi.co/api/v2/pokemon/${pokemonName}`);
        const pokemon = pokeApiResponse.data;
        const types = pokemon.types.map(t => t.type.name);
        const primaryType = types[0];
        const abilities = pokemon.abilities.map(a => a.ability.name.replace('-', ' '));
        const stats = pokemon.stats.reduce((acc, s) => {
            acc[s.stat.name.replace('special-', 'sp-')] = s.base_stat;
            return acc;
        }, {});

        let description = 'Nenhuma descrição encontrada.';
        try {
            const speciesResponse = await axios.get(pokemon.species.url);
            const ptEntry = speciesResponse.data.flavor_text_entries.find(entry => entry.language.name === 'pt');
            const enEntry = speciesResponse.data.flavor_text_entries.find(entry => entry.language.name === 'en');
            if (ptEntry) description = ptEntry.flavor_text.replace(/[\n\f]/g, ' ');
            else if (enEntry) description = enEntry.flavor_text.replace(/[\n\f]/g, ' ');
        } catch (speciesError) { console.error('Falha ao buscar descrição:', speciesError.message); }

        const matchingCountries = Object.keys(countryDataCache).filter(code => countryDataCache[code].baseType === primaryType);
        const top3Countries = matchingCountries.slice(0, 3).map(code => ({
            code: code,
            name: countryDataCache[code].name,
            flag: countryDataCache[code].flag
        }));

        if (top3Countries.length === 0) return res.status(404).json({ error: `Nenhum bioma principal encontrado para o tipo "${primaryType}".` });
        
        res.json({ 
            name: pokemonName, id: pokemon.id, types, countries: top3Countries,
            height: pokemon.height / 10, weight: pokemon.weight / 10,
            description, abilities, stats
        });

    } catch (error) {
        if (error.response && error.response.status === 404) return res.status(404).json({ error: `Pokémon "${pokemonName}" não encontrado.` });
        console.error('Erro na API:', error.message);
        res.status(500).json({ error: 'Falha ao comunicar com a PokéAPI.' });
    }
});

app.get('/api/autocomplete/pokemon', (req, res) => {
    const query = (req.query.query || '').toLowerCase();
    if (!query) return res.json([]);

    const suggestions = pokemonNameCache
        .filter(p => p.name.startsWith(query))
        .slice(0, 5);
    res.json(suggestions);
});

app.get('/api/autocomplete/country', (req, res) => {
    const query = (req.query.query || '').toLowerCase();
    if (!query || !countryDataCache) return res.json([]);
    
    const suggestions = Object.entries(countryDataCache)
        .filter(([code, data]) => data.name.toLowerCase().startsWith(query))
        .map(([code, data]) => ({ 
            code, 
            name: data.name, 
            flag: data.flag
        }))
        .slice(0, 5);
    res.json(suggestions);
});

app.get('/api/pokemon-by-country', async (req, res) => {
    const countryCode = (req.query.countryCode || '').toUpperCase();
    if (!countryCode || !countryDataCache[countryCode]) {
        return res.status(404).json({ error: 'Código de país inválido ou não encontrado.' });
    }

    const country = countryDataCache[countryCode];
    const biomeType = country.baseType;

    try {
        const typeResponse = await axios.get(`https://pokeapi.co/api/v2/type/${biomeType}`);
        const allPokemonOfType = typeResponse.data.pokemon;

        const filteredPokemon = allPokemonOfType.filter(p => {
            const urlParts = p.pokemon.url.split('/');
            const id = parseInt(urlParts[urlParts.length - 2]);
            return id < 1025;
        });

        const sample = filteredPokemon.slice(0, 8);
        
        const pokemonList = sample.map(p => {
            const urlParts = p.pokemon.url.split('/');
            const id = urlParts[urlParts.length - 2];
            return {
                name: p.pokemon.name,
                imageUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
            };
        });

        res.json({ country, pokemon: pokemonList });

    } catch (error) {
        console.error(`Falha ao buscar Pokémon do tipo ${biomeType}:`, error.message);
        res.status(500).json({ error: `Não foi possível buscar Pokémon para o bioma ${biomeType}.` });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor PokéPlanet a correr em http://localhost:${PORT}`);
    if (!OPENWEATHER_API_KEY) {
        console.warn('AVISO: A chave da API OpenWeatherMap não foi encontrada.');
    }
    initializeServerData();
    cacheAllPokemonNames();
});