// =============================================================================
// TARGET: Wide Painting Search (catch-all exploration)
//
// Goal:
//   - Randomize ALL QQL traits so the generator can explore emergent outputs.
//   - Keep scoring broad and style-agnostic for "any painting-like" matches.
//
// Notes:
//   - Returning an empty traits object lets qql-traits fill every trait randomly.
//   - DINOv3 remains the primary ranker in score.js; this heuristic is only a
//     generic tiebreaker based on visual richness/contrast.
// =============================================================================

const { createCanvas, loadImage } = require("canvas");

const name = "Painting Wide";

// Empty traits => qql-traits fills all trait fields randomly.
function traits() {
  return {};
}

const heuristicThreshold = 0;

// Optional prompts for CLIP-style workflows.
// DINO mode ignores these.
const textPrompts = [
  "abstract painting",
  "oil painting",
  "impressionist painting",
  "expressionist painting",
  "landscape painting",
  "seascape painting",
  "night sky painting",
  "blue and white painting",
  "blue and yellow painting",
  "museum painting",
];

// Wikimedia Commons categories to crawl for bulk reference images.
// download-references.js enumerates these via the MediaWiki API and downloads
// up to MAX_REFS (default 2000) thumbnails. Categories are crawled with one
// level of subcategory recursion for broad coverage.
const referenceCategories = [
  // Top-tier curated
  "Featured_pictures_of_paintings",
  "Featured_pictures_of_oil_paintings",
  // Movements & eras
  "Renaissance_paintings",
  "Baroque_paintings",
  "Impressionist_paintings",
  "Post-Impressionist_paintings",
  "Romantic_paintings",
  "Neoclassical_paintings",
  "Realist_paintings",
  "Expressionist_paintings",
  "Symbolist_paintings",
  "Art_Nouveau_paintings",
  "Ukiyo-e",
  // Major museums (Google Art Project scans are high quality)
  "Google_Art_Project_works_in_the_Rijksmuseum",
  "Google_Art_Project_works_in_the_Metropolitan_Museum_of_Art",
  "Google_Art_Project_works_in_the_Musée_d'Orsay",
  "Google_Art_Project_works_in_the_National_Gallery,_London",
  "Google_Art_Project_works_in_the_Museum_of_Modern_Art",
  // Major artists (prolific + public domain)
  "Paintings_by_Vincent_van_Gogh",
  "Paintings_by_Claude_Monet",
  "Paintings_by_Rembrandt",
  "Paintings_by_Pierre-Auguste_Renoir",
  "Paintings_by_Paul_Cézanne",
  "Paintings_by_J._M._W._Turner",
  "Paintings_by_Gustav_Klimt",
  "Paintings_by_Caspar_David_Friedrich",
  "Paintings_by_Eugène_Delacroix",
  "Paintings_by_Edgar_Degas",
  "Paintings_by_Paul_Gauguin",
  "Paintings_by_Sandro_Botticelli",
  "Paintings_by_Caravaggio",
  "Paintings_by_Johannes_Vermeer",
  "Paintings_by_Peter_Paul_Rubens",
  // Abstract & modern (public domain artists)
  "Paintings_by_Wassily_Kandinsky",
  "Paintings_by_Piet_Mondrian",
  "Paintings_by_Paul_Klee",
  "Paintings_by_Franz_Marc",
  "Paintings_by_Edvard_Munch",
];

// Curated baseline list — guaranteed downloads even if category crawl is slow.
// These ~95 images download first, then category crawl fills up to MAX_REFS (2000).
// The `wikimedia` field is the exact Commons filename — download-references.js
// resolves the correct thumbnail URL via the MediaWiki API at download time.
const referenceUrls = [
  // ===== RENAISSANCE & EARLY MODERN =====
  { name: "mona-lisa.jpg", wikimedia: "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg" },
  { name: "last-supper.jpg", wikimedia: "Última_Cena_-_Da_Vinci_5.jpg" },
  { name: "birth-of-venus.jpg", wikimedia: "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg" },
  { name: "primavera.jpg", wikimedia: "Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg" },
  { name: "creation-of-adam.jpg", wikimedia: "Michelangelo_-_Creation_of_Adam_(cropped).jpg" },
  { name: "school-of-athens.jpg", wikimedia: '"The_School_of_Athens"_by_Raffaello_Sanzio_da_Urbino.jpg' },
  { name: "venus-of-urbino.jpg", wikimedia: "Tiziano_-_Venere_di_Urbino_-_Google_Art_Project.jpg" },
  { name: "arnolfini-portrait.jpg", wikimedia: "Van_Eyck_-_Arnolfini_Portrait.jpg" },
  { name: "garden-of-earthly-delights.jpg", wikimedia: "The_Garden_of_earthly_delights.jpg" },
  { name: "tower-of-babel.jpg", wikimedia: "Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna)_-_Google_Art_Project_-_edited.jpg" },
  { name: "hunters-in-the-snow.jpg", wikimedia: "Pieter_Bruegel_the_Elder_-_Hunters_in_the_Snow_(Winter)_-_Google_Art_Project.jpg" },
  { name: "ambassadors.jpg", wikimedia: "Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg" },
  { name: "sistine-madonna.jpg", wikimedia: "RAFAEL_-_Madonna_Sixtina_(Gemäldegalerie_Alte_Meister,_Dresde,_1513-14._Óleo_sobre_lienzo,_265_x_196_cm).jpg" },

  // ===== BAROQUE =====
  { name: "girl-with-a-pearl-earring.jpg", wikimedia: "1665_Girl_with_a_Pearl_Earring.jpg" },
  { name: "the-milkmaid.jpg", wikimedia: "Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg" },
  { name: "view-of-delft.jpg", wikimedia: "Vermeer-view-of-delft.jpg" },
  { name: "the-lacemaker.jpg", wikimedia: "Johannes_Vermeer_-_The_lacemaker_(c.1669-1671).jpg" },
  { name: "girl-reading-letter.jpg", wikimedia: "Johannes_Vermeer_-_Girl_Reading_a_Letter_by_an_Open_Window_-_Gemäldegalerie_Alte_Meister.jpg" },
  { name: "the-night-watch.jpg", wikimedia: "The_Nightwatch_by_Rembrandt_-_Rijksmuseum.jpg" },
  { name: "anatomy-lesson.jpg", wikimedia: "Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg" },
  { name: "return-prodigal-son.jpg", wikimedia: "Rembrandt_Harmensz_van_Rijn_-_Return_of_the_Prodigal_Son_-_Google_Art_Project.jpg" },
  { name: "las-meninas.jpg", wikimedia: "Las_Meninas,_by_Diego_Velázquez,_from_Prado_in_Google_Earth.jpg" },
  { name: "calling-of-st-matthew.jpg", wikimedia: "The_Calling_of_Saint_Matthew-Caravaggo_(1599-1600).jpg" },
  { name: "judith-holofernes-artemisia.jpg", wikimedia: "Artemisia_Gentileschi_-_Judith_Beheading_Holofernes_(Naples).jpg" },
  { name: "bacchus-caravaggio.jpg", wikimedia: "Bacchus_by_Caravaggio.jpg" },

  // ===== ROCOCO =====
  { name: "the-swing.jpg", wikimedia: "Fragonard,_The_Swing.jpg" },

  // ===== NEOCLASSICISM =====
  { name: "oath-of-the-horatii.jpg", wikimedia: "Jacques-Louis_David_-_Oath_of_the_Horatii_-_Google_Art_Project.jpg" },
  { name: "napoleon-crossing-alps.jpg", wikimedia: "Jacques_Louis_David_-_Bonaparte_franchissant_le_Grand_Saint-Bernard,_20_mai_1800_-_Google_Art_Project.jpg" },
  { name: "death-of-marat.jpg", wikimedia: "Death_of_Marat_by_David.jpg" },
  { name: "coronation-of-napoleon.jpg", wikimedia: "Jacques-Louis_David,_The_Coronation_of_Napoleon_edit.jpg" },

  // ===== ROMANTICISM =====
  { name: "wanderer-above-fog.jpg", wikimedia: "Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg" },
  { name: "liberty-leading-people.jpg", wikimedia: "Eugène_Delacroix_-_Le_28_Juillet._La_Liberté_guidant_le_peuple.jpg" },
  { name: "raft-of-the-medusa.jpg", wikimedia: "JEAN_LOUIS_THÉODORE_GÉRICAULT_-_La_Balsa_de_la_Medusa_(Museo_del_Louvre,_1818-19).jpg" },
  { name: "third-of-may.jpg", wikimedia: "El_Tres_de_Mayo,_by_Francisco_de_Goya,_from_Prado_thin_black_margin.jpg" },
  { name: "saturn-devouring-son.jpg", wikimedia: "Francisco_de_Goya,_Saturno_devorando_a_su_hijo_(1819-1823).jpg" },
  { name: "hay-wain.jpg", wikimedia: "John_Constable_-_The_Hay_Wain_(1821).jpg" },
  { name: "rain-steam-speed.jpg", wikimedia: "Rain_Steam_and_Speed_the_Great_Western_Railway.jpg" },
  { name: "fighting-temeraire.jpg", wikimedia: "The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg" },
  { name: "slave-ship-turner.jpg", wikimedia: "Slave-ship.jpg" },
  { name: "abbey-in-oakwood.jpg", wikimedia: "Caspar_David_Friedrich_-_Abtei_im_Eichwald_-_Google_Art_Project.jpg" },

  // ===== PRE-RAPHAELITES =====
  { name: "ophelia.jpg", wikimedia: "John_Everett_Millais_-_Ophelia_-_Google_Art_Project.jpg" },
  { name: "lady-of-shalott.jpg", wikimedia: "John_William_Waterhouse_-_The_Lady_of_Shalott_-_Google_Art_Project_edit.jpg" },

  // ===== REALISM =====
  { name: "the-gleaners.jpg", wikimedia: "Jean-François_Millet_-_Gleaners_-_Google_Art_Project_2.jpg" },
  { name: "the-angelus.jpg", wikimedia: "JEAN-FRANÇOIS_MILLET_-_El_Ángelus_(Museo_de_Orsay,_1857-1859._Óleo_sobre_lienzo,_55.5_x_66_cm).jpg" },
  { name: "olympia.jpg", wikimedia: "Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg" },
  { name: "dejeuner-sur-lherbe.jpg", wikimedia: "Edouard_Manet_-_Luncheon_on_the_Grass_-_Google_Art_Project.jpg" },
  { name: "whistlers-mother.jpg", wikimedia: "Whistlers_Mother_high_res.jpg" },

  // ===== IMPRESSIONISM =====
  { name: "impression-sunrise.jpg", wikimedia: "Claude_Monet,_Impression,_soleil_levant.jpg" },
  { name: "water-lilies.jpg", wikimedia: "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg" },
  { name: "water-lilies-green.jpg", wikimedia: "Claude_Monet_-_Water_Lilies_-_1916.jpg" },
  { name: "japanese-bridge.jpg", wikimedia: "Water-Lilies-and-Japanese-Bridge-(1897-1899)-Monet.jpg" },
  { name: "rouen-cathedral.jpg", wikimedia: "Claude_Monet_-_Rouen_Cathedral,_Facade_(Sunset).jpg" },
  { name: "haystacks-monet.jpg", wikimedia: "Claude_Monet_-_Meules_(W1273).jpg" },
  { name: "bal-du-moulin.jpg", wikimedia: "Pierre-Auguste_Renoir,_Le_Moulin_de_la_Galette.jpg" },
  { name: "luncheon-boating-party.jpg", wikimedia: "Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg" },
  { name: "dance-class-degas.jpg", wikimedia: "Edgar_Degas_-_The_Ballet_Class_-_Google_Art_Project.jpg" },
  { name: "bar-at-folies.jpg", wikimedia: "Edouard_Manet,_A_Bar_at_the_Folies-Bergère.jpg" },
  { name: "poppy-field-monet.jpg", wikimedia: "Claude_Monet_-_Poppy_Field_-_Google_Art_Project.jpg" },

  // ===== POST-IMPRESSIONISM =====
  { name: "starry-night.jpg", wikimedia: "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg" },
  { name: "starry-night-rhone.jpg", wikimedia: "Starry_Night_Over_the_Rhone.jpg" },
  { name: "cafe-terrace-night.jpg", wikimedia: "Gogh,_Vincent_van_-_The_Cafe_Terrace_on_the_Place_du_Forum,_Arles,_at_Night.jpg" }, // codespell:ignore
  { name: "sunflowers.jpg", wikimedia: "Vincent_van_Gogh_-_Sunflowers_-_VGM_F458.jpg" },
  { name: "bedroom-in-arles.jpg", wikimedia: "Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg" },
  { name: "irises-vangogh.jpg", wikimedia: "Irises-Vincent_van_Gogh.jpg" },
  { name: "almond-blossom.jpg", wikimedia: "Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg" },
  { name: "wheatfield-crows.jpg", wikimedia: "Vincent_van_Gogh_(1853-1890)_-_Wheat_Field_with_Crows_(1890).jpg" },
  { name: "self-portrait-vangogh.jpg", wikimedia: "Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_(454045).jpg" },
  { name: "sunday-grande-jatte.jpg", wikimedia: "A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg" },
  { name: "card-players-cezanne.jpg", wikimedia: "Paul_Cézanne_-_The_Card_Players_-_Google_Art_Project.jpg" },
  { name: "mont-sainte-victoire.jpg", wikimedia: "Paul_Cézanne_113.jpg" },
  { name: "bathers-cezanne.jpg", wikimedia: "Paul_Cézanne,_1906,_Les_Grandes_Baigneuses_(The_Large_Bathers).jpg" },
  { name: "where-do-we-come-from-gauguin.jpg", wikimedia: "Paul_Gauguin_-_D'où_venons-nous.jpg" },
  { name: "yellow-christ-gauguin.jpg", wikimedia: "Paul_Gauguin_-_The_Yellow_Christ_-_Google_Art_Project.jpg" },
  { name: "vision-after-sermon.jpg", wikimedia: "Paul_Gauguin_019.jpg" },
  { name: "sleeping-gypsy.jpg", wikimedia: "Henri_Rousseau_-_La_Bohémienne_endormie.jpg" },
  { name: "the-dream-rousseau.jpg", wikimedia: "Henri_Rousseau_-_Il_sogno.jpg" },
  { name: "toulouse-lautrec-moulin-rouge.jpg", wikimedia: "Lautrec_moulin_rouge,_la_goulue_(poster)_1891.jpg" },

  // ===== SYMBOLISM & EXPRESSIONISM =====
  { name: "the-scream.jpg", wikimedia: "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg" },
  { name: "the-kiss-klimt.jpg", wikimedia: "Gustav_Klimt_016.jpg" },
  { name: "tree-of-life-klimt.jpg", wikimedia: "Gustav_Klimt_-_Der_Lebensbaum.jpg" },
  { name: "death-and-life-klimt.jpg", wikimedia: "Gustav_Klimt_-_Death_and_Life_-_Google_Art_Project.jpg" },
  { name: "isle-of-the-dead.jpg", wikimedia: "Arnold_Böcklin_-_Die_Toteninsel_V_(Museum_der_bildenden_Künste_Leipzig).jpg" },

  // ===== UKIYO-E & ASIAN ART =====
  { name: "great-wave.jpg", wikimedia: "Tsunami_by_hokusai_19th_century.jpg" },
  { name: "fine-wind-clear-morning.jpg", wikimedia: "Fine_Wind,_Clear_Morning.jpg" },
  { name: "plum-garden-hiroshige.jpg", wikimedia: "Hiroshige,_Plum_Garden_at_Kameido.jpg" },
  { name: "sudden-shower-hiroshige.jpg", wikimedia: "Hiroshige_-_Evening_Shower_at_Atake_and_the_Great_Bridge_-_Google_Art_Project.jpg" },

  // ===== AMERICAN =====
  { name: "american-gothic.jpg", wikimedia: "Grant_DeVolson_Wood_-_American_Gothic.jpg" },
  { name: "washington-crossing-delaware.jpg", wikimedia: "Washington_Crossing_the_Delaware_by_Emanuel_Leutze,_MMA-NYC,_1851.jpg" },
  { name: "watson-and-shark.jpg", wikimedia: "Copley,_John_Singleton_-_Watson_and_the_Shark_-_1778.jpg" },

  // ===== ADDITIONAL MASTERWORKS =====
  { name: "girl-with-balloon-greuze.jpg", wikimedia: "Jean-Baptiste_Greuze_-_Jeune_fille_qui_pleure_son_oiseau_mort_(1765).jpg" },
  { name: "persistence-of-memory.jpg", wikimedia: "The_Persistence_of_Memory.jpg" },
  { name: "starry-night-over-rhone-wide.jpg", wikimedia: "Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg" },
  { name: "venus-with-mirror-velazquez.jpg", wikimedia: "RokebyVenus.jpg" },
  { name: "bacchus-and-ariadne.jpg", wikimedia: "Titian_Bacchus_and_Ariadne.jpg" },
  { name: "nighthawks-hopper.jpg", wikimedia: "Nighthawks_by_Edward_Hopper_1942.jpg" },
];

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, v: v * 100 };
}

// Generic heuristic for broad visual richness.
// Keeps values in a readable 0-100-ish range for tie-breaking only.
async function scoreImage(imagePath) {
  const img = await loadImage(imagePath);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  const totalPixels = w * h;
  const colorBins = new Set();

  let satSum = 0;
  let lumSum = 0;
  let lumSqSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const { h: hue, s } = rgbToHsv(r, g, b);
    satSum += s;

    const l = luminance(r, g, b);
    lumSum += l;
    lumSqSum += l * l;

    // Coarse quantization for palette richness.
    const qR = Math.floor(r / 32);
    const qG = Math.floor(g / 32);
    const qB = Math.floor(b / 32);
    const qH = Math.floor(hue / 30);
    colorBins.add(`${qR}-${qG}-${qB}-${qH}`);
  }

  const meanSat = satSum / totalPixels;
  const meanLum = lumSum / totalPixels;
  const lumVar = Math.max(0, lumSqSum / totalPixels - meanLum * meanLum);
  const lumStd = Math.sqrt(lumVar);

  const colorRichness = Math.min(40, (colorBins.size / 180) * 40);
  const saturationScore = Math.min(30, (meanSat / 60) * 30);
  const contrastScore = Math.min(30, (lumStd / 70) * 30);

  const totalScore = colorRichness + saturationScore + contrastScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    colorRichness: Math.round(colorRichness * 100) / 100,
    saturationScore: Math.round(saturationScore * 100) / 100,
    contrastScore: Math.round(contrastScore * 100) / 100,
    colorBins: colorBins.size,
    avgSaturation: Math.round(meanSat * 10) / 10,
    lumStd: Math.round(lumStd * 10) / 10,
  };
}

const clipHeader = "Rank  Similarity  BestRef                Heur    Color   Sat     Ctrst   File";
const heurHeader = "Rank  Score   Color   Sat     Ctrst   Bins    AvgSat  LumStd  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.colorRichness).padStart(6)}  ` +
    `${String(s.saturationScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.colorRichness).padStart(6)}  ${String(s.saturationScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}  ` +
    `${String(s.colorBins).padStart(6)}  ` +
    `${String(s.avgSaturation).padStart(6)}  ` +
    `${String(s.lumStd).padStart(6)}  ` +
    `${s.file.slice(0, 28)}`
  );
}

module.exports = {
  name,
  traits,
  heuristicThreshold,
  textPrompts,
  referenceUrls,
  referenceCategories,
  scoreImage,
  clipHeader,
  heurHeader,
  formatClipRow,
  formatHeurRow,
};

