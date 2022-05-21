/*
 * Extrait le programme L'Avenir en commun depuis https://laec.fr
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
const url = "https://laec.fr";
const tocUrl = `${url}/sommaire`;

(async () => {
    //
    // Extraction
    //

    console.log(`Extraction depuis ${tocUrl}`);

    // Initialisation
    const distDir = path.join(__dirname, "..", "dist");
    const distMdFile = path.join(distDir, "laec.md");
    const np = "\\newpage\n\n";
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(distMdFile, `---
title: L’Avenir en commun
date: Le programme pour l’Union Populaire présenté par Jean-Luc Mélenchon
lang: fr-FR
---\n
${np}_L’harmonie des êtres humains entre eux et avec la nature comme vision du monde_\n
**« L’Avenir en commun »**\n\n`, "utf8");

    // Sommaire
    console.log("> Sommaire");
    const tocHtml = (await axios.get(tocUrl)).data;
    const tocDom = cheerio.load(tocHtml);
    const sections = tocDom("#main nav a.toc-chapter, #main nav a.toc-section")
        .filter((_, el) => tocDom(el).text().length > 10)
        .map((_, el) => ({
            title: tocDom(el).text().replace(/^\d+ +/, "").trim(),
            type: tocDom(el).attr("id")?.split("-")[0] || "section",
            number: tocDom(el).attr("href").split("/")[2],
            partNumber: tocDom(el).attr("class").split(" ")
                .find(c => c.match(/^toc-chapter-\d+$/)).split("-")[2],
            url: tocDom(el).attr("href")
        })).get();

    // Parties > Chapitres > Sections
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        console.log(`> ${section.type} ${section.number} (${section.url})`);
        const page = await extractPage(section.url);
        let content = "";
        // Titre
        if (section.type == "partie") {
            content += `${"#".repeat(2)}`;
        } else if (section.type == "chapitre") {
            content += `${"#".repeat(3)} Chapitre ${section.number} :`;
        } else {
            content += `${"#".repeat(4)} ${section.number}.`;
        }
        content += ` ${page.title}\n`;
        // Contenu
        if (page.content) {
            content += "\n" + page.content + "\n";
        }
        // Mesures
        if (page.keyMeasures?.length || page.measures?.length) {
            content += "\n" + "#".repeat(5) + " Mesure clé\n\n"
                + page.keyMeasures.map(m => `**${m}**\n\n`).join("")
                + page.measures.map(m => `- ${m}\n`).join("");
        }
        // À savoir
        if (page.toKnow?.length) {
            content += "\n" + "#".repeat(5) + " À savoir\n\n"
                + page.toKnow.map(k => `- ${k}\n`).join("");
        }
        // Saut de page
        content += "\n" + (page.content && i < sections.length - 1 ? np : "");
        await fs.appendFile(distMdFile, content, "utf8");
    }

    //
    // Exportation
    //

    const distFile = path.join(distDir, "L-Avenir-en-commun");
    const pandocCmd = "pandoc --lua-filter=filters/pagebreak.lua -s --toc --toc-depth=4";

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
 * @param {string} path Chemin de la page à extraire
 * @returns Le titre et le contenu de la page (au format Markdown)
 */
async function extractPage(path) {
    // Téléchargement de la page
    const html = (await axios.get(`${url}${path}`)).data;
    const dom = cheerio.load(html);
    // Extraction du titre
    const title = dom("h1 b").eq(0).text();
    // Extraction du contenu et nettoyage
    let content = turndown.turndown(dom("article#contenu div.semi-lead p").html()).trim()
        .replace(/(●|\\-) /g, "- ")    // Uniformisation des puces
        .replace(/: *\n-/g, ":\n\n-")  // Ajout d'une ligne blanche au-dessus des listes
        .replace(/ +\n/g, "\n")        // Suppression des espaces en fin de ligne
        .replace(/'/g, "’")            // Uniformisation des apostrophes
        .replace(/“ */g, "« ")         // Uniformisation des guillemets
        .replace(/ *”/g, " »")
        .replace(/a\u0300/g, "à")      // Uniformisation des caractères accentués
        // Mise en forme des citations
        .replace(/(«[^»\n]+»)\n([^,\n]+,[^,\n]+,[^,\n]+)\n/g, "> $1\n>\n> – _$2_\n");
    // Extraction des mesures clé
    let keyMeasures = dom("header.page-header nav.list-measures h5")
        .map((_, m) => turndown.turndown(dom(m).text()).trim()).toArray();
    // Extraction des autres mesures
    let measures = dom("section.section-measures nav.list-measures li")
        .map((_, m) => turndown.turndown(dom(m).text()).trim()).toArray();
    // Extraction des points à savoir
    let toKnow = dom(".addenda-list p strong")
        .map((_, k) => dom(k).html()).toArray()
        .flatMap(k => k.split("<br>")).map(l => l.trim()).filter(k => k)
        .map(k => turndown.turndown(k));
    return { title, content, keyMeasures, measures, toKnow };
}
