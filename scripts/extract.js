/*
 * Extrait le programme L'Avenir en commun depuis https://melenchon2022.fr
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
const tocUrl = "https://melenchon2022.fr/programme-version-de-travail-de-2020/";

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
date: Version de travail de novembre 2020
lang: fr-FR
---\n\n`, "utf8");

    // Sommaire
    console.log("> Sommaire");
    const tocHtml = (await axios.get(tocUrl)).data;
    const tocDom = cheerio.load(tocHtml);
    const sections = tocDom("main .elementor-heading-title a")
        .filter((_, el) => tocDom(el).text().length > 10)
        .map((_, el) => ({
            title: tocDom(el).text().trim(),
            url: tocDom(el).attr("href")
        })).get();

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
        const annex = await extractPage(annexes[i].url, 4, true);
        const annexContent = `${i == 0 ? "" : np}### ${annex.title}\n\n${annex.content}\n\n`;
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
 * Extrait une page du programme (préface, chapitre ou annexe) depuis l'URL
 * donnée puis la nettoie et la convertit en Markdown.
 *
 * @param {string} url URL de la page à extraire
 * @param {number} l Niveau des titres (par défaut : 3)
 * @param {boolean} annex La page à extraire est une annexe
 * @returns Le titre et le contenu de la page (au format Markdown)
 */
async function extractPage(url, l, annex) {
    const level = l || 3;
    // Téléchargement de la page
    const html = (await axios.get(url)).data;
    // Extraction du titre et du contenu
    const dom = cheerio.load(html);
    const title = dom("h2").eq(1).text();
    let raw = dom("body.page > div.page > div > section").slice(2, 3)
        .find(".elementor-widget-container").eq(0)
        .remove("span.elementor-menu-anchor").html();
    // Nettoyage du contenu
    if (!annex) raw = raw
        .replace(/h2>/g, "strong>"); // Certains titres n'en sont pas
    raw = raw
        .replace(/h[23]>/g, `h${level}>`) // Mise des titres au bon niveau
        .replace(/ ([a-z])<(strong|em)>([a-z])/gi, " <$2>$1$3") // <strong> et <em> mal positionnés
        .replace(/([a-z])<\/(strong|em)>([a-z]) /gi, "$1$3</$2> ") // </strong> et </em> mal positionnés
        .replace(/\s+<\/(strong|em)>\s*/g, "</$1> ") // </strong> et </em> mal positionnés (espace avant fin)
        .replace(/<strong>\s*<br>\s*<\/strong>/g, "</p><p>") // Correction de certains sauts à la ligne
        .trim();
    // Conversion en Markdown et suite du nettoyage
    let content = turndown.turndown(raw)
        .replace(/^[^\S\r\n]+_/gm, "_") // Suppression de l'espace devant les introductions
        .replace(/^(#+)\s*([\d]+)\\?\.\s+/gm, "$1 $2. "); // Formatage des titres numérotés
    if (!annex) content = content
        .replace(/^#+\s*(?:\*\*)?([^\d\s*#][^*\n]+)(?:\*\*)?$/gm, "#".repeat(level + 1) + " $1") // Titres non numérotés
        .replace(/^#+\s*(Pour en savoir plus[^:\n]+): *$/gm, "#".repeat(level) + " $1") // Titres "Pour en savoir plus [...]"
    content = content
        .replace(/\u00a0/g, " ") // Remplacement des espaces insécables
        .replace(/^(#+ .+) : *$/gm, "$1") // Suppression du ":" final pour les titres
        .replace(/ *\*\* *\*\*_([^_]+)_\*\* *\*\* */g, " _$1_ ") // Nettoyage des conflits <strong> et <em>
        .replace(/([^ ])\*\* {1,}\*\*([^ ])/g, "$1 $2") // Nettoyage des <strong> consécutifs
        .replace(/[^\S\r\n]+$/gm, "") // Nettoyage des espaces en fin de ligne
        .replace(/([^\n])\n(Concrètement|Pour aller plus loin) :\n/g, "$1\n\n$2 :\n") // Saut de paragraphe manquant
        .replace(/^(\s*)-\s+/gm, "$1- ") // Formatage des listes à puces
        .replace(/^\s*•\s+/gm, "- ") // Formatage des listes à puces non standard
        .replace(/\[\]\([^)]+\)/g, "") // Suppression des liens sans texte associé
        .replace(/([^\s]):([^\/])/g, "$1 :$2") // Espace manquant avant ":"
        .replace(/: +/g, ": ") // Suppression des espaces multiples après ":"
        .trim();
    return { title, content };
}
