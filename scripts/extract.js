/*
 * Extrait le programme L'Avenir en commun depuis https://noussommespour.fr/programme/
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
const tocUrl = "https://noussommespour.fr/programme/";

(async () => {
    //
    // Extraction
    //

    console.log(`Extraction depuis ${tocUrl}`);

    // Initialisation
    const distDir = path.join(__dirname, "..", "dist");
    const distMdFile = path.join(distDir, "laec.md");
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(distMdFile, `---
title: L’Avenir en commun
date: Version actualisée - Novembre 2020
lang: fr-FR
---\n\n`, "utf8");

    // Sommaire
    console.log("> Sommaire");
    const tocHtml = (await axios.get(tocUrl)).data;
    const tocDom = cheerio.load(tocHtml);
    const sections = tocDom("main h3 a").map((_, el) => {
        return {
            title: tocDom(el).text().trim(),
            url: tocDom(el).attr("href")
        };
    }).get();

    const chapters = sections.filter(s => !s.url.includes("annexe"));
    const annexes = sections.filter(s => s.url.includes("annexe"));
    const np = "\\newpage\n\n";

    // Chapitres
    for (let i = 0; i < chapters.length; i++) {
        console.log(`> Chapitre ${i} (${chapters[i].url})`);
        const chapter = await extractPage(chapters[i].url, 3);
        const chapterContent = `${np}## ${chapter.title}\n\n${chapter.content}\n\n`;
        await fs.appendFile(distMdFile, chapterContent, "utf8");
    }

    // Annexes
    await fs.appendFile(distMdFile, `${np}## Annexes\n\n`, "utf8");
    for (let i = 0; i < annexes.length; i++) {
        console.log(`> Annexe ${i + 1} (${annexes[i].url})`);
        const annex = await extractPage(annexes[i].url, 4);
        const annexContent = `${np}### ${annex.title}\n\n${annex.content}\n\n`;
        await fs.appendFile(distMdFile, annexContent, "utf8");
    }

    //
    // Exportation
    //

    const distFile = path.join(distDir, "L-Avenir-en-commun");
    const pandocCmd = "pandoc --lua-filter=filters/pagebreak.lua -s --toc";

    // md
    console.log(`Exportation (md) -> ${distFile}.md`);
    const distTxtContent = (await fs.readFile(distMdFile, "utf8"))
        .replace(/^---\ntitle: ([^\n]+)\ndate: ([^\n]+)\n.+\n---/, "# $1\n\n$2")
        .replace(/\\newpage\n\n/g, "");
    await fs.writeFile(`${distFile}.md`, distTxtContent, "utf8");
    // epub
    console.log(`Exportation (epub) -> ${distFile}.epub`);
    await exec(`${pandocCmd} "${distMdFile}" -o "${distFile}.epub"`);
    // html
    console.log(`Exportation (html) -> ${distFile}.html`);
    await exec(`${pandocCmd} "${distMdFile}" -o "${distFile}.html"`);
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
 * Extrait une page du programme (préface, chapitre ou annexe) depuis l'URL
 * donnée puis la nettoie et la convertit en Markdown.
 * 
 * @param {string} url URL de la page à extraire
 * @param {number} l Niveau des titres (par défaut : 3)
 * @returns Le titre et le contenu de la page (au format Markdown)
 */
async function extractPage(url, l) {
    const level = l || 3;
    const html = (await axios.get(url)).data;
    const dom = cheerio.load(html);
    const title = dom("h2").eq(0).text();
    const raw = dom("body.page > div.page > div > section").slice(2, 3)
        .find(".elementor-widget-container").eq(0)
        .remove("span.elementor-menu-anchor").html()
        .replace(/h2>/g, "strong>") // Certains titres n'en sont pas
        .replace(/h3>/g, `h${level}>`) // Mise des titres au bon niveau
        .replace(/\s+<\/(strong|em)>\s*/g, "</$1> ") // Nettoyage <strong> et <em>
        .replace(/<strong>\s*<br>\s*<\/strong>/g, "</p><p>") // Correction de certains sauts à la ligne
        .trim();
    const content = turndown.turndown(raw)
        .replace(/[^\S\r\n]+$/gm, "") // Nettoyage des espaces en fin de ligne
        .replace(/^[^\S\r\n]+_/gm, "_") // Suppression de l'espace devant les introductions
        .replace(/^(#+)\s*([\d]+)\\?\.\s+/gm, "$1 $2. ") // Formatage des titres numérotés
        .replace(/^#+\s*(?:\*\*)?([^\d\s*#][^*\n]+)(?:\*\*)?$/gm, "**$1**") // Titres non numérotés -> **[...]**
        .replace(/^\*\*(Pour en savoir plus[^:\n]+):\*\*$/gm, "#".repeat(level) + " $1") // Sauf "Pour en savoir plus [...]"
        .replace(/ *\*\* *\*\*_([^_]+)_\*\* *\*\* */g, " _$1_ ") // Nettoyage des conflits <strong> et <em>
        .replace(/^(\s*)-\s+/gm, "$1- ") // Formatage des listes à puces
        .replace(/^\s*•\s+/gm, "- ") // Formatage des listes à puces non standard
        .trim();
    return { title, content };
}
