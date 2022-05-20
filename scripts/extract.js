/*
 * Extrait le programme de la NUPES depuis https://nupes-2022.fr
 * et le convertit en plusieurs formats (md/txt, epub, html, rtf, odt et docx).
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);
const fs = require("fs").promises;
const path = require("path");
const turndown = new (require("turndown"))({
    headingStyle: "atx",
    bulletListMarker: "-"
});

// Source
const url = "https://nupes-2022.fr/le-programme";

(async () => {
    //
    // Extraction
    //

    console.log(`Extraction depuis ${url}`);

    // Initialisation
    const distDir = path.join(__dirname, "..", "dist");
    const distMdFile = path.join(distDir, "nupes.md");
    const np = "\\newpage\n\n";
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(distMdFile, `---
title: NUPES - Le programme
date: Programme partagé de gouvernement de la Nouvelle Union populaire écologique et sociale
lang: fr-FR
---\n\n${np}`, "utf8");

    // Téléchargement du programme complet
    console.log("> Sommaire");
    const html = (await axios.get(url)).data;
    const dom = cheerio.load(html);
    const document = dom("section[data-id=d3a76d1] > div > div > .elementor-widget-wrap").eq(0);
    const headers = dom(document).find("div.elementor-widget-heading").slice(1);
    const texts = dom(document).find("div.elementor-widget-text-editor");

    // Chapitres
    for (let i = 0; i < headers.length && i < texts.length; i++) {
        console.log(`> Chapitre ${i - 1}`);
        const title = headers.eq(i).text().trim()
            .replace(/[\u200b\u202f]/g, ""); // Suppression des caractères parasites
        let content = `## ${title}\n\n`;
        content += getChapterContent(texts.eq(i).html());
        // Saut de page
        content += "\n" + (i < headers.length - 1 ? "\n" + np : "");
        await fs.appendFile(distMdFile, content, "utf8");
    }

    //
    // Exportation
    //

    const distFile = path.join(distDir, "NUPES-Le-programme");
    const pandocCmd = "pandoc --lua-filter=filters/pagebreak.lua -s --toc --toc-depth=2 --eol=lf";

    // md
    console.log(`Exportation (md) -> ${distFile}.md`);
    const distTxtContent = (await fs.readFile(distMdFile, "utf8"))
        .replace(/^---\ntitle: ([^\n]+)\ndate: ([^\n]+)\n.+\n---/, "# $1\n\n$2")
        .replace(/\\newpage\n\n/g, "");
    await fs.writeFile(`${distFile}.md`, distTxtContent, "utf8");
    // html
    console.log(`Exportation (html) -> ${distFile}.html`);
    const htmlTemplateFile = path.join(__dirname, "..", "templates", "template.html");
    await exec(`${pandocCmd} "${distMdFile}" --template="${htmlTemplateFile}" -o "${distFile}.html"`);
    // epub
    console.log(`Exportation (epub) -> ${distFile}.epub`);
    await exec(`${pandocCmd} "${distMdFile}" -o "${distFile}.epub"`);
    // rtf
    console.log(`Exportation (rtf) -> ${distFile}.rtf`);
    await exec(`${pandocCmd} "${distMdFile}" -o "${distFile}.rtf"`);
    // odt
    console.log(`Exportation (odt) -> ${distFile}.odt`);
    await exec(`${pandocCmd} "${distMdFile}" -o "${distFile}.odt"`);
    // docx
    console.log(`Exportation (docx) -> ${distFile}.docx`);
    await exec(`${pandocCmd} "${distMdFile}" -o "${distFile}.docx"`);

})();

/**
 * Nettoie et convertit en Markdown un chapitre HTML du programme.
 *
 * @param {string} rawHtml Contenu brut du chapitre au format HTML
 * @returns Le contenu du chapitre nettoyé et au format Markdown
 */
function getChapterContent(rawHtml) {
    const html = rawHtml
        .replace(/h4>/g, "h3>")           // Modification du niveau des titres
        .replace(/“ */g, "« ")            // Uniformisation des guillemets
        .replace(/ *”/g, " »")
        .replace(/a\u0300/g, "à")         // Uniformisation des caractères accentués
        .replace(/e\u0301/g, "é")
        .replace(/i\u0302/g, "î")
        .replace(/&nbsp;/g, " ")          // Suppression des &nbsp;
        .replace(/[\u200b\u202f]/g, "");  // Suppression des caractères parasites
    const listItems = [...Array(8).keys()];
    return turndown.turndown(html).trim()
        .replace(/^( *-) +/gm, "$1 ")     // Suppression des espaces après les puces
        .replace(/ +$/gm, "")             // Suppression des espaces en fin de ligne
        // Suppression des lignes blanches entre des éléments d'une liste
        .replace(/\n- (.+)\n\n- /g, "\n- $1\n- ")
        // Ré-indentation d'une sous-liste spécifique
        .replace(new RegExp("(l’école :\n)" + listItems.map(() => `- (.+)\n`).join("")),
            "$1" + listItems.map(i => `    - \$${i + 2}\n`).join(""));
}
