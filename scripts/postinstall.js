/*
 * postinstall.js
 * Tâches additionnelles après l'installation des dépendances
 */

const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

const projectDir = path.join(__dirname, "..");

(async () => {
    // Téléchargement et modification du filtre Lua pagebreak pour Pandoc
    const pageBreakFilterUrl = "https://raw.githubusercontent.com/pandoc/lua-filters/master/pagebreak/pagebreak.lua";
    await fs.mkdir(path.join(projectDir, "filters"), { recursive: true});
    await fs.writeFile(path.join(projectDir, "filters", "pagebreak.lua"),
        (await axios.get(pageBreakFilterUrl)).data.replace(/context/g, "rtf"), "utf8");

    // Téléchargement et modification du template HTML5 de Pandoc
    const htmlTemplateUrl = "https://raw.githubusercontent.com/jgm/pandoc-templates/master/default.html5";
    await fs.mkdir(path.join(projectDir, "templates"), { recursive: true});
    const htmlTemplate = (await axios.get(htmlTemplateUrl)).data
        .replace(/ xmlns="[^"]+"/, "").replace(/ xml:lang=.+>/, ">")
        .replace(/\n +<meta name="generator" content="pandoc" \/>/, "")
        .replace(/\n +<style>.+<\/style>/s, "")
        .replace(/\n +<!--\[if.+endif\]-->/s, "");
    await fs.writeFile(path.join(projectDir, "templates", "template.html"), htmlTemplate, "utf8");
})();
