/*
 * postinstall.js
 * Tâches additionnelles après l'installation des dépendances.
 */

const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

(async () => {
    // Téléchargement et modification du filtre Lua pagebreak pour Pandoc
    const url = "https://raw.githubusercontent.com/pandoc/lua-filters/master/pagebreak/pagebreak.lua";
    await fs.mkdir(path.join(__dirname, "..", "filters"), { recursive: true});
    await fs.writeFile(path.join(__dirname, "..", "filters", "pagebreak.lua"),
        (await axios.get(url)).data.replace(/context/g, "rtf"), "utf8");
})();
