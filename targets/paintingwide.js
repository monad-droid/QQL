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
  "Cubist_paintings",
  "Surrealist_paintings",
  "Abstract_art",
  "Mannerist_paintings",
  "Pre-Raphaelite_paintings",
  "Gothic_paintings",
  "Fauvism",
  // Major museums (Google Art Project scans are high quality)
  "Google_Art_Project_works_in_the_Rijksmuseum",
  "Google_Art_Project_works_in_the_Metropolitan_Museum_of_Art",
  "Google_Art_Project_works_in_the_Musée_d'Orsay",
  "Google_Art_Project_works_in_the_National_Gallery,_London",
  "Google_Art_Project_works_in_the_Museum_of_Modern_Art",
  "Google_Art_Project_works_in_the_Hermitage_Museum",
  "Google_Art_Project_works_in_the_Uffizi",
  "Google_Art_Project_works_in_the_Museo_del_Prado",
  "Google_Art_Project_works_in_the_Art_Institute_of_Chicago",
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
  "Paintings_by_Leonardo_da_Vinci",
  "Paintings_by_Raphael",
  "Paintings_by_Titian",
  "Paintings_by_Michelangelo",
  "Paintings_by_El_Greco",
  "Paintings_by_Francisco_de_Goya",
  "Paintings_by_Diego_Velázquez",
  "Paintings_by_Jacques-Louis_David",
  "Paintings_by_Gustave_Courbet",
  "Paintings_by_Théodore_Géricault",
  "Paintings_by_John_Constable",
  "Paintings_by_Édouard_Manet",
  "Paintings_by_Henri_Rousseau",
  "Paintings_by_Georges_Seurat",
  "Paintings_by_Henri_de_Toulouse-Lautrec",
  "Paintings_by_Albrecht_Dürer",
  "Paintings_by_Hieronymus_Bosch",
  "Paintings_by_Pieter_Bruegel_the_Elder",
  "Paintings_by_Jan_van_Eyck",
  "Paintings_by_Ilya_Repin",
  "Paintings_by_Ivan_Aivazovsky",
  // Abstract & modern (public domain artists)
  "Paintings_by_Wassily_Kandinsky",
  "Paintings_by_Piet_Mondrian",
  "Paintings_by_Paul_Klee",
  "Paintings_by_Franz_Marc",
  "Paintings_by_Edvard_Munch",
  "Paintings_by_Kazimir_Malevich",
  "Paintings_by_Pablo_Picasso",
  "Paintings_by_Henri_Matisse",
  "Paintings_by_Marc_Chagall",
  "Paintings_by_Amedeo_Modigliani",
];

// Curated baseline list — guaranteed downloads even if category crawl is slow.
// These ~200 images download first, then category crawl fills up to MAX_REFS.
// The `wikimedia` field is the exact Commons filename — download-references.js
// resolves the correct thumbnail URL via the MediaWiki API at download time.
// Any that fail to resolve are silently skipped.
const referenceUrls = [
  // ===== MEDIEVAL & PROTO-RENAISSANCE =====
  { name: "kiss-of-judas-giotto.jpg", wikimedia: "Giotto_-_Scrovegni_-_-31-_-_Kiss_of_Judas.jpg" },
  { name: "lamentation-giotto.jpg", wikimedia: "Giotto_di_Bondone_-_No._36_Scenes_from_the_Life_of_Christ_-_20._Lamentation_(The_Mourning_of_Christ)_-_WGA09197.jpg" },
  { name: "annunciation-fra-angelico.jpg", wikimedia: "Fra_Angelico_-_The_Annunciation_-_WGA00555.jpg" },
  { name: "expulsion-masaccio.jpg", wikimedia: "Masaccio-TheExpulsionOfAdamAndEveFromEden-Restoration.jpg" },
  { name: "birth-of-venus-botticelli.jpg", wikimedia: "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project.jpg" },
  { name: "adoration-magi-gentile.jpg", wikimedia: "Gentile_da_Fabriano_-_Adoration_of_the_Magi_-_WGA08543.jpg" },

  // ===== NORTHERN RENAISSANCE =====
  { name: "arnolfini-portrait.jpg", wikimedia: "Van_Eyck_-_Arnolfini_Portrait.jpg" },
  { name: "ghent-altarpiece.jpg", wikimedia: "Ghent_Altarpiece_-_Adoration_of_the_Mystic_Lamb.jpg" },
  { name: "man-in-red-turban.jpg", wikimedia: "Portrait_of_a_Man_by_Jan_van_Eyck-small.jpg" },
  { name: "descent-cross-weyden.jpg", wikimedia: "Weyden_Deposition.jpg" },
  { name: "self-portrait-durer-1500.jpg", wikimedia: "Albrecht_Dürer_-_1500_self-portrait_(High_resolution_and_detail).jpg" },
  { name: "melencolia-durer.jpg", wikimedia: "Dürer_Melencolia_I.jpg" },
  { name: "garden-of-earthly-delights.jpg", wikimedia: "The_Garden_of_earthly_delights.jpg" },
  { name: "haywain-triptych-bosch.jpg", wikimedia: "Jheronimus_Bosch_-_De_hooiwagen_(c.1516,_Prado).jpg" },
  { name: "tower-of-babel.jpg", wikimedia: "Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna)_-_Google_Art_Project_-_edited.jpg" },
  { name: "hunters-in-the-snow.jpg", wikimedia: "Pieter_Bruegel_the_Elder_-_Hunters_in_the_Snow_(Winter)_-_Google_Art_Project.jpg" },
  { name: "fall-of-icarus.jpg", wikimedia: "Pieter_Bruegel_de_Oude_-_De_val_van_Icarus.jpg" },
  { name: "ambassadors.jpg", wikimedia: "Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg" },

  // ===== ITALIAN HIGH RENAISSANCE =====
  { name: "mona-lisa.jpg", wikimedia: "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg" },
  { name: "last-supper.jpg", wikimedia: "Última_Cena_-_Da_Vinci_5.jpg" },
  { name: "lady-with-ermine.jpg", wikimedia: "Lady_with_an_Ermine_-_Leonardo_da_Vinci_-_Google_Art_Project.jpg" },
  { name: "virgin-of-the-rocks.jpg", wikimedia: "Leonardo_Da_Vinci_-_Vergine_delle_Rocce_(Louvre).jpg" },
  { name: "birth-of-venus.jpg", wikimedia: "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg" },
  { name: "primavera.jpg", wikimedia: "Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg" },
  { name: "creation-of-adam.jpg", wikimedia: "Michelangelo_-_Creation_of_Adam_(cropped).jpg" },
  { name: "last-judgment-michelangelo.jpg", wikimedia: "Last_Judgement_(Michelangelo).jpg" },
  { name: "school-of-athens.jpg", wikimedia: '"The_School_of_Athens"_by_Raffaello_Sanzio_da_Urbino.jpg' },
  { name: "transfiguration-raphael.jpg", wikimedia: "Transfigurazione_(Raffaello)_September_2015-1a.jpg" },
  { name: "sistine-madonna.jpg", wikimedia: "RAFAEL_-_Madonna_Sixtina_(Gemäldegalerie_Alte_Meister,_Dresde,_1513-14._Óleo_sobre_lienzo,_265_x_196_cm).jpg" },
  { name: "venus-of-urbino.jpg", wikimedia: "Tiziano_-_Venere_di_Urbino_-_Google_Art_Project.jpg" },
  { name: "assumption-virgin-titian.jpg", wikimedia: "Tizian_041.jpg" },
  { name: "bacchus-and-ariadne.jpg", wikimedia: "Titian_Bacchus_and_Ariadne.jpg" },

  // ===== MANNERISM =====
  { name: "burial-of-count-orgaz.jpg", wikimedia: "El_Greco_-_The_Burial_of_the_Count_of_Orgaz.JPG" },
  { name: "view-of-toledo.jpg", wikimedia: "El_Greco_View_of_Toledo.jpg" },

  // ===== BAROQUE =====
  { name: "girl-with-a-pearl-earring.jpg", wikimedia: "1665_Girl_with_a_Pearl_Earring.jpg" },
  { name: "the-milkmaid.jpg", wikimedia: "Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg" },
  { name: "view-of-delft.jpg", wikimedia: "Vermeer-view-of-delft.jpg" },
  { name: "the-lacemaker.jpg", wikimedia: "Johannes_Vermeer_-_The_lacemaker_(c.1669-1671).jpg" },
  { name: "girl-reading-letter.jpg", wikimedia: "Johannes_Vermeer_-_Girl_Reading_a_Letter_by_an_Open_Window_-_Gemäldegalerie_Alte_Meister.jpg" },
  { name: "art-of-painting-vermeer.jpg", wikimedia: "Jan_Vermeer_-_The_Art_of_Painting_-_Google_Art_Project.jpg" },
  { name: "girl-red-hat-vermeer.jpg", wikimedia: "Jan_Vermeer_van_Delft_-_Girl_with_a_Red_Hat_-_WGA24657.jpg" },
  { name: "the-night-watch.jpg", wikimedia: "The_Nightwatch_by_Rembrandt_-_Rijksmuseum.jpg" },
  { name: "anatomy-lesson.jpg", wikimedia: "Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg" },
  { name: "return-prodigal-son.jpg", wikimedia: "Rembrandt_Harmensz_van_Rijn_-_Return_of_the_Prodigal_Son_-_Google_Art_Project.jpg" },
  { name: "self-portrait-rembrandt.jpg", wikimedia: "Rembrandt_Self-portrait_(Kenwood).jpg" },
  { name: "jewish-bride-rembrandt.jpg", wikimedia: "Rembrandt_Harmensz._van_Rijn_-_Het_Joodse_bruidje.jpg" },
  { name: "las-meninas.jpg", wikimedia: "Las_Meninas,_by_Diego_Velázquez,_from_Prado_in_Google_Earth.jpg" },
  { name: "venus-with-mirror-velazquez.jpg", wikimedia: "RokebyVenus.jpg" },
  { name: "calling-of-st-matthew.jpg", wikimedia: "The_Calling_of_Saint_Matthew-Caravaggo_(1599-1600).jpg" },
  { name: "judith-holofernes-artemisia.jpg", wikimedia: "Artemisia_Gentileschi_-_Judith_Beheading_Holofernes_(Naples).jpg" },
  { name: "judith-holofernes-caravaggio.jpg", wikimedia: "Judith_Beheading_Holofernes-Caravaggio_(c.1598-9).jpg" },
  { name: "david-goliath-caravaggio.jpg", wikimedia: "Caravaggio_-_David_con_la_testa_di_Golia.jpg" },
  { name: "supper-at-emmaus-caravaggio.jpg", wikimedia: "1602-3_Caravaggio,Supper_at_Emmaus_National_Gallery,_London.jpg" },
  { name: "bacchus-caravaggio.jpg", wikimedia: "Bacchus_by_Caravaggio.jpg" },
  { name: "descent-cross-rubens.jpg", wikimedia: "Peter_Paul_Rubens_-_Descent_from_the_Cross_-_WGA20212.jpg" },
  { name: "samson-delilah-rubens.jpg", wikimedia: "Peter_Paul_Rubens_-_Samson_and_Delilah_-_Google_Art_Project.jpg" },
  { name: "garden-of-love-rubens.jpg", wikimedia: "Peter_Paul_Rubens_-_The_Garden_of_Love_-_Google_Art_Project.jpg" },
  { name: "laughing-cavalier-hals.jpg", wikimedia: "Cavalier_soldier_Hals-1624x.jpg" },

  // ===== ROCOCO & 18TH CENTURY =====
  { name: "the-swing.jpg", wikimedia: "Fragonard,_The_Swing.jpg" },
  { name: "blue-boy-gainsborough.jpg", wikimedia: "Thomas_Gainsborough_-_The_Blue_Boy_(The_Huntington_Library,_San_Marino_L._A.).jpg" },
  { name: "mr-and-mrs-andrews.jpg", wikimedia: "Thomas_Gainsborough_-_Mr_and_Mrs_Andrews_(1750).jpg" },
  { name: "the-nightmare-fuseli.jpg", wikimedia: "John_Henry_Fuseli_-_The_Nightmare.jpg" },

  // ===== NEOCLASSICISM =====
  { name: "oath-of-the-horatii.jpg", wikimedia: "Jacques-Louis_David_-_Oath_of_the_Horatii_-_Google_Art_Project.jpg" },
  { name: "napoleon-crossing-alps.jpg", wikimedia: "Jacques_Louis_David_-_Bonaparte_franchissant_le_Grand_Saint-Bernard,_20_mai_1800_-_Google_Art_Project.jpg" },
  { name: "death-of-marat.jpg", wikimedia: "Death_of_Marat_by_David.jpg" },
  { name: "coronation-of-napoleon.jpg", wikimedia: "Jacques-Louis_David,_The_Coronation_of_Napoleon_edit.jpg" },
  { name: "grande-odalisque.jpg", wikimedia: "Jean_Auguste_Dominique_Ingres,_La_Grande_Odalisque,_1814.jpg" },
  { name: "turkish-bath-ingres.jpg", wikimedia: "Le_Bain_Turc,_by_Jean_Auguste_Dominique_Ingres,_from_C2RMF_retouched.jpg" },

  // ===== ROMANTICISM =====
  { name: "wanderer-above-fog.jpg", wikimedia: "Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg" },
  { name: "monk-by-the-sea.jpg", wikimedia: "Caspar_David_Friedrich_-_Der_Mönch_am_Meer_-_Google_Art_Project.jpg" },
  { name: "chalk-cliffs-rugen.jpg", wikimedia: "Caspar_David_Friedrich_-_Kreidefelsen_auf_Rügen_-_Google_Art_Project.jpg" },
  { name: "abbey-in-oakwood.jpg", wikimedia: "Caspar_David_Friedrich_-_Abtei_im_Eichwald_-_Google_Art_Project.jpg" },
  { name: "liberty-leading-people.jpg", wikimedia: "Eugène_Delacroix_-_Le_28_Juillet._La_Liberté_guidant_le_peuple.jpg" },
  { name: "death-of-sardanapalus.jpg", wikimedia: "Eugène_Delacroix_-_La_Mort_de_Sardanapale.jpg" },
  { name: "raft-of-the-medusa.jpg", wikimedia: "JEAN_LOUIS_THÉODORE_GÉRICAULT_-_La_Balsa_de_la_Medusa_(Museo_del_Louvre,_1818-19).jpg" },
  { name: "third-of-may.jpg", wikimedia: "El_Tres_de_Mayo,_by_Francisco_de_Goya,_from_Prado_thin_black_margin.jpg" },
  { name: "saturn-devouring-son.jpg", wikimedia: "Francisco_de_Goya,_Saturno_devorando_a_su_hijo_(1819-1823).jpg" },
  { name: "maja-desnuda-goya.jpg", wikimedia: "Francisco_de_Goya_y_Lucientes_-_La_maja_desnuda_-_Google_Art_Project_2.jpg" },
  { name: "hay-wain.jpg", wikimedia: "John_Constable_-_The_Hay_Wain_(1821).jpg" },
  { name: "rain-steam-speed.jpg", wikimedia: "Rain_Steam_and_Speed_the_Great_Western_Railway.jpg" },
  { name: "fighting-temeraire.jpg", wikimedia: "The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg" },
  { name: "slave-ship-turner.jpg", wikimedia: "Slave-ship.jpg" },

  // ===== PRE-RAPHAELITES & VICTORIAN =====
  { name: "ophelia.jpg", wikimedia: "John_Everett_Millais_-_Ophelia_-_Google_Art_Project.jpg" },
  { name: "lady-of-shalott.jpg", wikimedia: "John_William_Waterhouse_-_The_Lady_of_Shalott_-_Google_Art_Project_edit.jpg" },
  { name: "hylas-and-nymphs.jpg", wikimedia: "John_William_Waterhouse_-_Hylas_and_the_Nymphs_(1896).jpg" },
  { name: "flaming-june.jpg", wikimedia: "Flaming_June,_by_Frederic_Lord_Leighton_(1830-1896).jpg" },

  // ===== REALISM =====
  { name: "the-gleaners.jpg", wikimedia: "Jean-François_Millet_-_Gleaners_-_Google_Art_Project_2.jpg" },
  { name: "the-angelus.jpg", wikimedia: "JEAN-FRANÇOIS_MILLET_-_El_Ángelus_(Museo_de_Orsay,_1857-1859._Óleo_sobre_lienzo,_55.5_x_66_cm).jpg" },
  { name: "olympia.jpg", wikimedia: "Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg" },
  { name: "dejeuner-sur-lherbe.jpg", wikimedia: "Edouard_Manet_-_Luncheon_on_the_Grass_-_Google_Art_Project.jpg" },
  { name: "whistlers-mother.jpg", wikimedia: "Whistlers_Mother_high_res.jpg" },
  { name: "burial-at-ornans.jpg", wikimedia: "Gustave_Courbet_-_A_Burial_at_Ornans_-_Google_Art_Project_2.jpg" },
  { name: "painters-studio-courbet.jpg", wikimedia: "Courbet_LAtelier_du_peintre.jpg" },
  { name: "bonjour-monsieur-courbet.jpg", wikimedia: "Gustave_Courbet_-_Bonjour_Monsieur_Courbet_-_Musée_Fabre.jpg" },

  // ===== IMPRESSIONISM =====
  { name: "impression-sunrise.jpg", wikimedia: "Claude_Monet,_Impression,_soleil_levant.jpg" },
  { name: "water-lilies.jpg", wikimedia: "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg" },
  { name: "water-lilies-green.jpg", wikimedia: "Claude_Monet_-_Water_Lilies_-_1916.jpg" },
  { name: "japanese-bridge.jpg", wikimedia: "Water-Lilies-and-Japanese-Bridge-(1897-1899)-Monet.jpg" },
  { name: "rouen-cathedral.jpg", wikimedia: "Claude_Monet_-_Rouen_Cathedral,_Facade_(Sunset).jpg" },
  { name: "haystacks-monet.jpg", wikimedia: "Claude_Monet_-_Meules_(W1273).jpg" },
  { name: "woman-with-parasol-monet.jpg", wikimedia: "Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg" },
  { name: "poppy-field-monet.jpg", wikimedia: "Claude_Monet_-_Poppy_Field_-_Google_Art_Project.jpg" },
  { name: "la-grenouillere-monet.jpg", wikimedia: "Claude_Monet_La_Grenouillère.jpg" },
  { name: "gare-saint-lazare-monet.jpg", wikimedia: "Claude_Monet_-_The_Gare_Saint-Lazare_-_Arrival_of_a_Train.jpg" },
  { name: "bal-du-moulin.jpg", wikimedia: "Pierre-Auguste_Renoir,_Le_Moulin_de_la_Galette.jpg" },
  { name: "luncheon-boating-party.jpg", wikimedia: "Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg" },
  { name: "two-sisters-renoir.jpg", wikimedia: "Pierre-Auguste_Renoir_-_Two_Sisters_(On_the_Terrace)_-_Google_Art_Project.jpg" },
  { name: "dance-class-degas.jpg", wikimedia: "Edgar_Degas_-_The_Ballet_Class_-_Google_Art_Project.jpg" },
  { name: "labsinthe-degas.jpg", wikimedia: "Edgar_Degas_-_In_a_Café_-_Google_Art_Project_2.jpg" },
  { name: "the-star-degas.jpg", wikimedia: "Edgar_Degas_-_L%27Étoile.jpg" },
  { name: "bar-at-folies.jpg", wikimedia: "Edouard_Manet,_A_Bar_at_the_Folies-Bergère.jpg" },
  { name: "paris-street-rainy-day.jpg", wikimedia: "Gustave_Caillebotte_-_Paris_Street;_Rainy_Day_-_Google_Art_Project.jpg" },
  { name: "boulevard-montmartre-pissarro.jpg", wikimedia: "Camille_Pissarro_-_The_Boulevard_Montmartre_at_Night_-_Google_Art_Project.jpg" },

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
  { name: "night-cafe-vangogh.jpg", wikimedia: "Le_café_de_nuit_(The_Night_Café)_by_Vincent_van_Gogh.jpeg" },
  { name: "potato-eaters-vangogh.jpg", wikimedia: "Vincent_van_Gogh_-_The_Potato_Eaters_-_Google_Art_Project.jpg" },
  { name: "red-vineyard-vangogh.jpg", wikimedia: "Vincent_van_Gogh_-_The_Red_Vineyard_-_Google_Art_Project.jpg" },
  { name: "self-portrait-bandaged-ear.jpg", wikimedia: "Vincent_van_Gogh_-_Self-portrait_with_bandaged_ear_(1889,_Courtauld_Institute).jpg" },
  { name: "sunday-grande-jatte.jpg", wikimedia: "A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg" },
  { name: "bathers-asnieres-seurat.jpg", wikimedia: "Georges_Seurat_-_Bathers_at_Asnières_-_Google_Art_Project.jpg" },
  { name: "card-players-cezanne.jpg", wikimedia: "Paul_Cézanne_-_The_Card_Players_-_Google_Art_Project.jpg" },
  { name: "mont-sainte-victoire.jpg", wikimedia: "Paul_Cézanne_113.jpg" },
  { name: "bathers-cezanne.jpg", wikimedia: "Paul_Cézanne,_1906,_Les_Grandes_Baigneuses_(The_Large_Bathers).jpg" },
  { name: "where-do-we-come-from-gauguin.jpg", wikimedia: "Paul_Gauguin_-_D'où_venons-nous.jpg" },
  { name: "yellow-christ-gauguin.jpg", wikimedia: "Paul_Gauguin_-_The_Yellow_Christ_-_Google_Art_Project.jpg" },
  { name: "vision-after-sermon.jpg", wikimedia: "Paul_Gauguin_019.jpg" },
  { name: "tahitian-women-gauguin.jpg", wikimedia: "Paul_Gauguin_-_Femmes_de_Tahiti.jpg" },
  { name: "sleeping-gypsy.jpg", wikimedia: "Henri_Rousseau_-_La_Bohémienne_endormie.jpg" },
  { name: "the-dream-rousseau.jpg", wikimedia: "Henri_Rousseau_-_Il_sogno.jpg" },
  { name: "toulouse-lautrec-moulin-rouge.jpg", wikimedia: "Lautrec_moulin_rouge,_la_goulue_(poster)_1891.jpg" },

  // ===== SYMBOLISM & ART NOUVEAU =====
  { name: "the-scream.jpg", wikimedia: "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg" },
  { name: "the-kiss-klimt.jpg", wikimedia: "Gustav_Klimt_016.jpg" },
  { name: "tree-of-life-klimt.jpg", wikimedia: "Gustav_Klimt_-_Der_Lebensbaum.jpg" },
  { name: "death-and-life-klimt.jpg", wikimedia: "Gustav_Klimt_-_Death_and_Life_-_Google_Art_Project.jpg" },
  { name: "portrait-adele-bloch-bauer.jpg", wikimedia: "Gustav_Klimt_046.jpg" },
  { name: "judith-klimt.jpg", wikimedia: "Gustav_Klimt_039.jpg" },
  { name: "isle-of-the-dead.jpg", wikimedia: "Arnold_Böcklin_-_Die_Toteninsel_V_(Museum_der_bildenden_Künste_Leipzig).jpg" },
  { name: "madonna-munch.jpg", wikimedia: "Edvard_Munch_-_Madonna_-_Google_Art_Project.jpg" },

  // ===== EXPRESSIONISM =====
  { name: "composition-viii-kandinsky.jpg", wikimedia: "Vassily_Kandinsky,_1923_-_Composition_8,_huile_sur_toile,_140_cm_x_201_cm,_Musée_Guggenheim,_New_York.jpg" },
  { name: "several-circles-kandinsky.jpg", wikimedia: "Vassily_Kandinsky,_1926_-_Several_Circles,_Gugg_0910_25.jpg" },
  { name: "yellow-red-blue-kandinsky.jpg", wikimedia: "Vassily_Kandinsky,_1925_-_Yellow-Red-Blue.jpg" },
  { name: "blue-rider-kandinsky.jpg", wikimedia: "Vassily_Kandinsky,_1903,_The_Blue_Rider_(Der_Blaue_Reiter),_oil_on_canvas,_52.1_x_54.6_cm,_Stiftung_Sammlung_E.G._Bührle,_Zurich.jpg" },
  { name: "large-blue-horses-marc.jpg", wikimedia: "Franz_Marc_-_Die_großen_blauen_Pferde.jpg" },
  { name: "fate-of-animals-marc.jpg", wikimedia: "Franz_Marc_-_Tierschicksale_-_Google_Art_Project.jpg" },
  { name: "tiger-marc.jpg", wikimedia: "Franz_Marc_-_Tiger_-_Google_Art_Project.jpg" },
  { name: "senecio-klee.jpg", wikimedia: "Paul_Klee_-_Senecio_-_Google_Art_Project.jpg" },
  { name: "red-balloon-klee.jpg", wikimedia: "Paul_Klee,_1922,_Red_Balloon.jpg" },

  // ===== ABSTRACT, DE STIJL & SUPREMATISM =====
  { name: "composition-red-blue-yellow-mondrian.jpg", wikimedia: "Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg" },
  { name: "broadway-boogie-woogie.jpg", wikimedia: "Piet_Mondrian,_1942_-_Broadway_Boogie_Woogie.jpg" },
  { name: "tableau-i-mondrian.jpg", wikimedia: "Piet_Mondriaan,_1921_-_Tableau_I.jpg" },
  { name: "black-square-malevich.jpg", wikimedia: "Kazimir_Malevich,_1915,_Black_Suprematic_Square,_oil_on_linen_canvas,_79.5_x_79.5_cm,_Tretyakov_Gallery,_Moscow.jpg" },
  { name: "suprematist-composition-malevich.jpg", wikimedia: "Suprematist_Composition_-_Kazimir_Malevich.jpg" },

  // ===== CUBISM, FAUVISM & EARLY MODERN =====
  { name: "guernica-picasso.jpg", wikimedia: "PicassoGuernica.jpg" },
  { name: "demoiselles-davignon.jpg", wikimedia: "Les_Demoiselles_d%27Avignon.jpg" },
  { name: "old-guitarist-picasso.jpg", wikimedia: "Old_guitarist_chicago.jpg" },
  { name: "weeping-woman-picasso.jpg", wikimedia: "Picasso_The_Weeping_Woman_Tate_identifier_T05010_10.jpg" },
  { name: "girl-before-mirror-picasso.jpg", wikimedia: "Pablo_Picasso,_1932,_Girl_Before_a_Mirror.jpg" },
  { name: "dance-matisse.jpg", wikimedia: "Matissedance.jpg" },
  { name: "joy-of-life-matisse.jpg", wikimedia: "Henri_Matisse,_1905-06,_Le_bonheur_de_vivre_(The_Joy_of_Life).jpg" },
  { name: "nude-descending-staircase.jpg", wikimedia: "Duchamp_-_Nude_Descending_a_Staircase.jpg" },

  // ===== SURREALISM =====
  { name: "persistence-of-memory.jpg", wikimedia: "The_Persistence_of_Memory.jpg" },
  { name: "elephants-dali.jpg", wikimedia: "Salvador_Dalí_-_The_Elephants.jpg" },
  { name: "son-of-man-magritte.jpg", wikimedia: "Magritte_TheSonOfMan.jpg" },
  { name: "treachery-of-images-magritte.jpg", wikimedia: "MassonAutomatic1924.jpg" },
  { name: "i-and-the-village-chagall.jpg", wikimedia: "Chagall_IandTheVillage.jpg" },

  // ===== RUSSIAN REALISM =====
  { name: "ivan-terrible-repin.jpg", wikimedia: "Ilya_Repin_-_Ivan_the_Terrible_and_his_son_Ivan_-_Google_Art_Project.jpg" },
  { name: "barge-haulers-repin.jpg", wikimedia: "Ilia_Efimovich_Repin_(1844-1930)_-_Volga_Boatmen_(1870-1873).jpg" },
  { name: "ninth-wave-aivazovsky.jpg", wikimedia: "Ivan_Constantinovich_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg" },

  // ===== UKIYO-E & ASIAN ART =====
  { name: "great-wave.jpg", wikimedia: "Tsunami_by_hokusai_19th_century.jpg" },
  { name: "fine-wind-clear-morning.jpg", wikimedia: "Fine_Wind,_Clear_Morning.jpg" },
  { name: "plum-garden-hiroshige.jpg", wikimedia: "Hiroshige,_Plum_Garden_at_Kameido.jpg" },
  { name: "sudden-shower-hiroshige.jpg", wikimedia: "Hiroshige_-_Evening_Shower_at_Atake_and_the_Great_Bridge_-_Google_Art_Project.jpg" },
  { name: "ejiri-in-suruga-hokusai.jpg", wikimedia: "Ejiri_in_Suruga_Province.jpg" },
  { name: "fuji-from-gotenyama-hokusai.jpg", wikimedia: "Hokusai42_gotenyama.jpg" },

  // ===== AMERICAN =====
  { name: "american-gothic.jpg", wikimedia: "Grant_DeVolson_Wood_-_American_Gothic.jpg" },
  { name: "washington-crossing-delaware.jpg", wikimedia: "Washington_Crossing_the_Delaware_by_Emanuel_Leutze,_MMA-NYC,_1851.jpg" },
  { name: "watson-and-shark.jpg", wikimedia: "Copley,_John_Singleton_-_Watson_and_the_Shark_-_1778.jpg" },
  { name: "nighthawks-hopper.jpg", wikimedia: "Nighthawks_by_Edward_Hopper_1942.jpg" },
  { name: "freedom-from-want-rockwell.jpg", wikimedia: "Freedom_from_Want_-_Norman_Rockwell.jpg" },
  { name: "church-frederic-heart-andes.jpg", wikimedia: "Frederic_Edwin_Church_-_The_Heart_of_the_Andes_-_Google_Art_Project.jpg" },

  // ===== ADDITIONAL MASTERWORKS =====
  { name: "girl-with-balloon-greuze.jpg", wikimedia: "Jean-Baptiste_Greuze_-_Jeune_fille_qui_pleure_son_oiseau_mort_(1765).jpg" },
  { name: "girl-reading-fragonard.jpg", wikimedia: "Fragonard,_The_Reader.jpg" },
  { name: "wanderer-caspar-friedrich.jpg", wikimedia: "Caspar_David_Friedrich_-_Two_Men_Contemplating_the_Moon.jpg" },
  { name: "gothic-church-in-ruin.jpg", wikimedia: "Caspar_David_Friedrich_-_Monastery_Graveyard_in_the_Snow.jpg" },
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

