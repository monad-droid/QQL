#!/usr/bin/env node
// =============================================================================
// Build Art References
//
// Generates data/art-references.json from a curated list of ~1000 famous
// paintings with their Wikimedia Commons filenames.
//
// URL format: Special:FilePath redirect (works with curl -L).
// At download time, Wikimedia resolves the filename to the correct CDN path.
//
// Usage:
//   node scripts/build-art-references.js
// =============================================================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Wikimedia Commons thumbnail via Special:FilePath (follows redirects)
function commonsUrl(filename, width = 800) {
  const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`;
}

// Direct CDN URL via MD5 hash (faster, no redirect, but needs exact filename)
function cdnThumbUrl(filename, width = 800) {
  const normalized = filename.replace(/ /g, "_");
  const md5 = crypto.createHash("md5").update(normalized).digest("hex");
  const a = md5[0];
  const ab = md5.slice(0, 2);
  const encoded = encodeURIComponent(normalized);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${encoded}/${width}px-${encoded}`;
}

// Slugify a painting title for use as local filename
function slugify(title, artist) {
  const base = title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base + ".jpg";
}

// ============================================================================
// CURATED PAINTING DATA
//
// Format: [title, artist, year, commonsFilename]
//
// commonsFilename = exact filename on Wikimedia Commons (without File: prefix)
// ============================================================================

const paintings = [
  // =========================================================================
  // MEDIEVAL & EARLY RENAISSANCE (1200–1480)
  // =========================================================================
  ["The Arnolfini Portrait", "Jan van Eyck", 1434, "The_Arnolfini_portrait_(1434).jpg"],
  ["Ghent Altarpiece - Adoration of the Mystic Lamb", "Jan van Eyck", 1432, "Ghent_Altarpiece_-_Adoration_of_the_Mystic_Lamb.jpg"],
  ["The Descent from the Cross", "Rogier van der Weyden", 1435, "Weyden_Deposition.jpg"],
  ["The Garden of Earthly Delights", "Hieronymus Bosch", 1510, "The_Garden_of_earthly_delights.jpg"],
  ["The Last Judgment", "Hieronymus Bosch", 1482, "Last_judgement_Bosch.jpg"],
  ["The Temptation of St Anthony", "Hieronymus Bosch", 1501, "Triptych_of_Temptation_of_St_Anthony_by_Bosch.jpg"],
  ["Maestà", "Duccio", 1311, "Duccio_maesta1021.jpg"],
  ["The Lamentation", "Giotto", 1306, "Giotto_-_Scrovegni_-_-36-_-_Lamentation_(The_Mourning_of_Christ)_adj.jpg"],
  ["The Kiss of Judas", "Giotto", 1306, "Giotto_-_Scrovegni_-_-31-_-_Kiss_of_Judas.jpg"],
  ["Adoration of the Magi", "Gentile da Fabriano", 1423, "Gentile_da_Fabriano_-_Adorazione_dei_Magi_-_Google_Art_Project.jpg"],
  ["The Annunciation", "Fra Angelico", 1435, "ANGELICO,_Fra_Annunciation,_1437-46_(2236990916).jpg"],
  ["The Battle of San Romano", "Paolo Uccello", 1438, "Paolo_Uccello_023.jpg"],
  ["The Flagellation of Christ", "Piero della Francesca", 1455, "Piero_della_Francesca_-_The_Flagellation_-_WGA17600.jpg"],
  ["The Baptism of Christ", "Piero della Francesca", 1450, "Piero_della_Francesca_-_Battesimo_di_Cristo_(National_Gallery,_London).jpg"],
  ["Portrait of a Man", "Antonello da Messina", 1475, "Antonello_da_Messina_-_Portrait_of_a_Man_-_National_Gallery_London.jpg"],
  ["The Portinari Altarpiece", "Hugo van der Goes", 1475, "Hugo_van_der_Goes_004.jpg"],
  ["Pietà", "Giovanni Bellini", 1465, "Giovanni_Bellini_Pietà.jpg"],
  ["Madonna and Child", "Giovanni Bellini", 1480, "Giovanni_Bellini_-_Madonna_and_Child_-_Google_Art_Project.jpg"],
  ["The Tribuna of the Uffizi", "Johann Zoffany", 1777, "Johann_Zoffany_-_Tribuna_of_the_Uffizi_-_Google_Art_Project.jpg"],
  ["Self-Portrait", "Albrecht Dürer", 1500, "Albrecht_Dürer_-_Self-Portrait_at_28_-_Google_Art_Project.jpg"],
  ["Melencolia I", "Albrecht Dürer", 1514, "Albrecht_Dürer_-_Melencolia_I_-_Google_Art_Project_(_AGDdr3EHmNGyA).jpg"],
  ["The Four Apostles", "Albrecht Dürer", 1526, "Albrecht_Dürer_-_The_Four_Apostles_-_Google_Art_Project.jpg"],
  ["The Ambassadors", "Hans Holbein the Younger", 1533, "Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg"],
  ["Portrait of Henry VIII", "Hans Holbein the Younger", 1537, "Hans_Holbein_d._J._-_Portrait_of_Henry_VIII_-_Google_Art_Project.jpg"],
  ["The Hunters in the Snow", "Pieter Bruegel the Elder", 1565, "Pieter_Bruegel_the_Elder_-_Hunters_in_the_Snow_(Winter)_-_Google_Art_Project.jpg"],
  ["The Tower of Babel", "Pieter Bruegel the Elder", 1563, "Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna)_-_Google_Art_Project_-_edited.jpg"],
  ["Peasant Wedding", "Pieter Bruegel the Elder", 1567, "Pieter_Bruegel_the_Elder_-_Peasant_Wedding_-_Google_Art_Project_2.jpg"],
  ["The Triumph of Death", "Pieter Bruegel the Elder", 1562, "The_Triumph_of_Death_by_Pieter_Bruegel_the_Elder.jpg"],
  ["Netherlandish Proverbs", "Pieter Bruegel the Elder", 1559, "Pieter_Brueghel_the_Elder_-_The_Dutch_Proverbs_-_Google_Art_Project.jpg"],

  // =========================================================================
  // HIGH RENAISSANCE (1480–1530)
  // =========================================================================
  ["Mona Lisa", "Leonardo da Vinci", 1506, "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg"],
  ["The Last Supper", "Leonardo da Vinci", 1498, "Leonardo_da_Vinci_-_The_Last_Supper_high_res.jpg"],
  ["The Virgin of the Rocks", "Leonardo da Vinci", 1486, "Leonardo_Da_Vinci_-_Vergine_delle_Rocce_(Louvre).jpg"],
  ["Lady with an Ermine", "Leonardo da Vinci", 1490, "Lady_with_an_Ermine_-_Leonardo_da_Vinci_-_Google_Art_Project.jpg"],
  ["Vitruvian Man", "Leonardo da Vinci", 1490, "Da_Vinci_Vitruve_Luc_Viatour.jpg"],
  ["The Annunciation", "Leonardo da Vinci", 1475, "Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg"],
  ["Sistine Chapel ceiling", "Michelangelo", 1512, "CAPPELLA_SISTINA_Ceiling.jpg"],
  ["The Creation of Adam", "Michelangelo", 1512, "Michelangelo_-_Creation_of_Adam_(cropped).jpg"],
  ["The Last Judgment", "Michelangelo", 1541, "Last_Judgement_(Michelangelo).jpg"],
  ["David", "Michelangelo", 1504, "'David'_by_Michelangelo_Fir_JBU005.jpg"],
  ["The School of Athens", "Raphael", 1511, "Raphael_School_of_Athens.jpg"],
  ["Sistine Madonna", "Raphael", 1514, "RAFAEL_-_Madonna_Sixtina_(Gemäldegalerie_Alte_Meister,_Dresde,_1513-14._Óleo_sobre_lienzo,_265_x_196_cm).jpg"],
  ["The Transfiguration", "Raphael", 1520, "Transfiguration_Raphael.jpg"],
  ["The Marriage of the Virgin", "Raphael", 1504, "Raffaello_-_Spozalizio_-_Web_Gallery_of_Art.jpg"],
  ["Portrait of Baldassare Castiglione", "Raphael", 1515, "Sanzio_-_Baldassare_Castiglione.jpg"],
  ["La Fornarina", "Raphael", 1520, "Raffaello_Sanzio_-_La_Fornarina_-_Google_Art_Project.jpg"],
  ["Birth of Venus", "Sandro Botticelli", 1486, "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg"],
  ["Primavera", "Sandro Botticelli", 1482, "Botticelli-primavera.jpg"],
  ["Venus and Mars", "Sandro Botticelli", 1485, "Sandro_Botticelli_-_Venus_and_Mars_-_WGA2776.jpg"],
  ["Assumption of the Virgin", "Titian", 1518, "Tizian_041.jpg"],
  ["Venus of Urbino", "Titian", 1538, "Tiziano_-_Venere_di_Urbino_-_Google_Art_Project.jpg"],
  ["Bacchus and Ariadne", "Titian", 1523, "Titian_Bacchus_and_Ariadne.jpg"],
  ["Sacred and Profane Love", "Titian", 1514, "Tiziano_-_Amor_Sacro_y_Amor_Profano_(Galería_Borghese,_Roma,_1514).jpg"],
  ["Man with a Glove", "Titian", 1520, "Titien_-_L'Homme_au_gant.jpg"],
  ["The Tempest", "Giorgione", 1508, "Giorgione_-_La_tempesta.jpg"],
  ["Sleeping Venus", "Giorgione", 1510, "Giorgione_-_Sleeping_Venus_-_Google_Art_Project_2.jpg"],
  ["The Wedding at Cana", "Paolo Veronese", 1563, "Paolo_Veronese_-_The_Wedding_at_Cana_-_WGA24853.jpg"],
  ["The Feast in the House of Levi", "Paolo Veronese", 1573, "Veronese,_The_Feast_in_the_House_of_Levi.jpg"],

  // =========================================================================
  // MANNERISM & LATE RENAISSANCE (1520–1600)
  // =========================================================================
  ["The Burial of the Count of Orgaz", "El Greco", 1588, "El_Greco_-_The_Burial_of_the_Count_of_Orgaz.JPG"],
  ["View of Toledo", "El Greco", 1600, "El_Greco_View_of_Toledo.jpg"],
  ["The Disrobing of Christ", "El Greco", 1579, "El_Expolio,_by_El_Greco,_from_Prado_in_Google_Earth.jpg"],
  ["Perseus with the Head of Medusa", "Benvenuto Cellini", 1554, "Persee-florence.jpg"],
  ["Venus, Cupid, Folly and Time", "Bronzino", 1545, "Angelo_Bronzino_-_Venus,_Cupid,_Folly_and_Time_-_National_Gallery,_London.jpg"],
  ["The Last Supper", "Tintoretto", 1594, "Jacopo_Tintoretto_-_The_Last_Supper_-_WGA22649.jpg"],
  ["Abduction of the Sabine Women", "Giambologna", 1583, "Giambologna_rapbread.jpg"],
  ["Self-Portrait in a Convex Mirror", "Parmigianino", 1524, "Parmigianino_Selfportrait.jpg"],
  ["Madonna with the Long Neck", "Parmigianino", 1540, "Parmigianino_-_Madonna_dal_collo_lungo_-_Google_Art_Project.jpg"],
  ["Judith Slaying Holofernes", "Artemisia Gentileschi", 1620, "Artemisia_Gentileschi_-_Judith_Slaying_Holofernes_-_WGA8563.jpg"],

  // =========================================================================
  // BAROQUE (1600–1750)
  // =========================================================================
  ["The Calling of Saint Matthew", "Caravaggio", 1600, "The_Calling_of_Saint_Matthew-Caravaggo_(1599-1600).jpg"],
  ["Judith Beheading Holofernes", "Caravaggio", 1599, "Caravaggio_Judith_Beheading_Holofernes.jpg"],
  ["The Supper at Emmaus", "Caravaggio", 1601, "Caravaggio_-_Cena_in_Emmaus.jpg"],
  ["Bacchus", "Caravaggio", 1595, "Michelangelo_Merisi_da_Caravaggio_-_Bacchus_-_Google_Art_Project.jpg"],
  ["The Conversion of Saint Paul", "Caravaggio", 1601, "Conversion_on_the_Way_to_Damascus-Caravaggio_(c.1600-1).jpg"],
  ["The Entombment of Christ", "Caravaggio", 1604, "Caravaggio_-_La_Deposizione_di_Cristo.jpg"],
  ["David with the Head of Goliath", "Caravaggio", 1610, "Caravaggio_-_David_con_la_testa_di_Golia.jpg"],
  ["Narcissus", "Caravaggio", 1599, "Narcissus-Caravaggio_(1594-96)_edited.jpg"],
  ["The Night Watch", "Rembrandt", 1642, "The_Nightwatch_by_Rembrandt_-_Rijksmuseum.jpg"],
  ["The Anatomy Lesson of Dr. Nicolaes Tulp", "Rembrandt", 1632, "Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg"],
  ["Self-Portrait with Two Circles", "Rembrandt", 1665, "Rembrandt_Self-portrait_(Kenwood).jpg"],
  ["The Return of the Prodigal Son", "Rembrandt", 1669, "Rembrandt_Harmensz._van_Rijn_-_The_Return_of_the_Prodigal_Son.jpg"],
  ["The Storm on the Sea of Galilee", "Rembrandt", 1633, "Rembrandt_Christ_in_the_Storm_on_the_Lake_of_Galilee.jpg"],
  ["Bathsheba at Her Bath", "Rembrandt", 1654, "Rembrandt_Bathsheba_at_Her_Bath_(1654).jpg"],
  ["The Jewish Bride", "Rembrandt", 1667, "Rembrandt_Harmensz._van_Rijn_-_Het_Joodse_bruidje.jpg"],
  ["Self-Portrait", "Rembrandt", 1659, "Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg"],
  ["Girl with a Pearl Earring", "Johannes Vermeer", 1665, "Girl_with_a_Pearl_Earring.jpg"],
  ["The Milkmaid", "Johannes Vermeer", 1660, "Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg"],
  ["Girl Reading a Letter at an Open Window", "Johannes Vermeer", 1657, "Johannes_Vermeer_-_Girl_Reading_a_Letter_by_an_Open_Window_-_Google_Art_Project.jpg"],
  ["The Art of Painting", "Johannes Vermeer", 1668, "Jan_Vermeer_-_The_Art_of_Painting_-_Google_Art_Project.jpg"],
  ["View of Delft", "Johannes Vermeer", 1661, "Vermeer-view-of-delft.jpg"],
  ["Woman Holding a Balance", "Johannes Vermeer", 1664, "Johannes_Vermeer_-_Woman_Holding_a_Balance_-_Google_Art_Project.jpg"],
  ["The Lacemaker", "Johannes Vermeer", 1670, "Johannes_Vermeer_-_The_lacemaker_(c.1669-1671).jpg"],
  ["Las Meninas", "Diego Velázquez", 1656, "Las_Meninas,_by_Diego_Velázquez,_from_Prado_in_Google_Earth.jpg"],
  ["The Surrender of Breda", "Diego Velázquez", 1635, "Velazquez-The_Surrender_of_Breda.jpg"],
  ["The Rokeby Venus", "Diego Velázquez", 1651, "Rokeby_Venus_Velasquez.jpg"],
  ["Pope Innocent X", "Diego Velázquez", 1650, "Retrato_del_Papa_Inocencio_X._Roma,_by_Diego_Velázquez.jpg"],
  ["Christ on the Cross", "Diego Velázquez", 1632, "Cristo_crucificado.jpg"],
  ["The Descent from the Cross", "Peter Paul Rubens", 1614, "Descent_from_the_Cross_(Rubens)_July_2015-1a.jpg"],
  ["The Raising of the Cross", "Peter Paul Rubens", 1611, "Peter_Paul_Rubens_-_The_Raising_of_the_Cross_-_WGA20204.jpg"],
  ["The Garden of Love", "Peter Paul Rubens", 1633, "Peter_Paul_Rubens_-_The_Garden_of_Love_-_Google_Art_Project.jpg"],
  ["The Three Graces", "Peter Paul Rubens", 1635, "Peter_Paul_Rubens_-_The_Three_Graces,_1635.jpg"],
  ["Samson and Delilah", "Peter Paul Rubens", 1610, "Peter_Paul_Rubens_-_Samson_and_Delilah_-_Google_Art_Project.jpg"],
  ["The Massacre of the Innocents", "Peter Paul Rubens", 1612, "Rubens_-_Massacre_of_the_Innocents_-_Art_Gallery_of_Ontario_2.jpg"],
  ["Self-Portrait with Straw Hat", "Peter Paul Rubens", 1625, "Peter_Paul_Rubens_-_Le_Chapeau_de_Paille.jpg"],
  ["The Laughing Cavalier", "Frans Hals", 1624, "Frans_Hals_-_Portret_van_een_man_(De_lachende_cavalier)_-_Google_Art_Project.jpg"],
  ["The Merry Drinker", "Frans Hals", 1628, "Frans_Hals_-_Malle_Babbe_-_Google_Art_Project.jpg"],
  ["Woman with a Water Jug", "Johannes Vermeer", 1662, "Johannes_Vermeer_-_Woman_with_a_Water_Jug_-_Google_Art_Project.jpg"],

  // =========================================================================
  // DUTCH GOLDEN AGE & 17TH-18TH CENTURY
  // =========================================================================
  ["Girl with the Red Hat", "Johannes Vermeer", 1667, "Johannes_Vermeer_-_Girl_with_a_Red_Hat_-_Google_Art_Project.jpg"],
  ["The Geographer", "Johannes Vermeer", 1669, "Johannes_Vermeer_-_The_Geographer_-_Google_Art_Project.jpg"],
  ["The Astronomer", "Johannes Vermeer", 1668, "Johannes_Vermeer_-_The_Astronomer_-_WGA24685.jpg"],
  ["The Goldfinch", "Carel Fabritius", 1654, "Fabritius-vansen.jpg"],
  ["The Bull", "Paulus Potter", 1647, "Potter_De_stier.jpg"],
  ["Still Life with Lobster", "Abraham van Beyeren", 1653, "Abraham_van_Beyeren_-_Banquet_Still_Life_-_Google_Art_Project.jpg"],
  ["The Merry Family", "Jan Steen", 1668, "Jan_Havicksz._Steen_-_Het_vrolijke_huisgezin.jpg"],
  ["Avenue at Middelharnis", "Meindert Hobbema", 1689, "Meindert_Hobbema_001.jpg"],
  ["Interior of the Oude Kerk", "Emanuel de Witte", 1651, "Emanuel_de_Witte_-_Interior_of_the_Oude_Kerk,_Delft_-_WGA25802.jpg"],
  ["The Anatomy Lesson of Dr. Deijman", "Rembrandt", 1656, "Rembrandt_Harmensz._van_Rijn_-_De_anatomische_les_van_Dr._Deijman.jpg"],

  // =========================================================================
  // ROCOCO & NEOCLASSICISM (1700–1800)
  // =========================================================================
  ["The Swing", "Jean-Honoré Fragonard", 1767, "Fragonard,_The_Swing.jpg"],
  ["The Embarkation for Cythera", "Antoine Watteau", 1717, "L'Embarquement_pour_Cythere,_by_Antoine_Watteau,_from_C2RMF_retouched.jpg"],
  ["Pierrot", "Antoine Watteau", 1719, "Jean-Antoine_Watteau_-_Pierrot,_dit_autrefois_Gilles.jpg"],
  ["The Toilet of Venus", "François Boucher", 1751, "François_Boucher_-_The_Toilette_of_Venus_-_Google_Art_Project.jpg"],
  ["Girl with a Dog", "Jean-Honoré Fragonard", 1775, "Fragonard_-_A_Young_Girl_Reading.jpg"],
  ["The Oath of the Horatii", "Jacques-Louis David", 1784, "Jacques-Louis_David_-_Oath_of_the_Horatii_-_Google_Art_Project.jpg"],
  ["The Death of Marat", "Jacques-Louis David", 1793, "Jacques-Louis_David_-_Marat_assassiné_-_Google_Art_Project_2.jpg"],
  ["Napoleon Crossing the Alps", "Jacques-Louis David", 1801, "Jacques_Louis_David_-_Bonaparte_franchissant_le_Grand_Saint-Bernard,_20_mai_1800_-_Google_Art_Project.jpg"],
  ["The Coronation of Napoleon", "Jacques-Louis David", 1807, "Jacques-Louis_David_-_The_Coronation_of_Napoleon_(1805-1807).jpg"],
  ["The Grande Odalisque", "Jean-Auguste-Dominique Ingres", 1814, "Jean_Auguste_Dominique_Ingres,_La_Grande_Odalisque,_1814.jpg"],
  ["The Turkish Bath", "Jean-Auguste-Dominique Ingres", 1862, "Le_Bain_Turc,_by_Jean_Auguste_Dominique_Ingres,_from_C2RMF_retouched.jpg"],
  ["Portrait of Madame Recamier", "Jacques-Louis David", 1800, "Madame_Récamier_painted_by_Jacques-Louis_David_in_1800.jpg"],
  ["The Valpinçon Bather", "Jean-Auguste-Dominique Ingres", 1808, "Jean-Auguste-Dominique_Ingres_-_The_Valpinçon_Bather_-_Google_Art_Project.jpg"],
  ["Capriccio with Classical Ruins", "Giovanni Paolo Panini", 1755, "Giovanni_Paolo_Pannini_-_Gallery_of_Views_of_Ancient_Rome_-_Google_Art_Project.jpg"],
  ["An Experiment on a Bird in the Air Pump", "Joseph Wright of Derby", 1768, "An_Experiment_on_a_Bird_in_the_Air_Pump_by_Joseph_Wright_of_Derby,_1768.jpg"],
  ["Mr and Mrs Andrews", "Thomas Gainsborough", 1750, "Thomas_Gainsborough_-_Mr_and_Mrs_Andrews.jpg"],
  ["The Blue Boy", "Thomas Gainsborough", 1770, "Thomas_Gainsborough_-_The_Blue_Boy_(The_Huntington_Library,_San_Marino_L._A.).jpg"],
  ["A Rake's Progress", "William Hogarth", 1735, "William_Hogarth_-_A_Rake's_Progress_-_Plate_3_-_The_Tavern_Scene.jpg"],

  // =========================================================================
  // ROMANTICISM (1780–1860)
  // =========================================================================
  ["The Third of May 1808", "Francisco Goya", 1814, "El_Tres_de_Mayo,_by_Francisco_de_Goya,_from_Prado_thin_black_margin.jpg"],
  ["Saturn Devouring His Son", "Francisco Goya", 1823, "Francisco_de_Goya,_Saturno_devorando_a_su_hijo_(1819-1823).jpg"],
  ["The Nude Maja", "Francisco Goya", 1800, "Goya_Maja_naga2.jpg"],
  ["The Clothed Maja", "Francisco Goya", 1805, "Goya_Maja_ubrana2.jpg"],
  ["The Sleep of Reason Produces Monsters", "Francisco Goya", 1799, "Francisco_José_de_Goya_y_Lucientes_-_The_sleep_of_reason_produces_monsters_(No._43),_from_Los_Caprichos_-_Google_Art_Project.jpg"],
  ["The Colossus", "Francisco Goya", 1812, "El_Coloso.jpg"],
  ["Liberty Leading the People", "Eugène Delacroix", 1830, "Eugène_Delacroix_-_Le_28_Juillet._La_Liberté_guidant_le_peuple.jpg"],
  ["The Death of Sardanapalus", "Eugène Delacroix", 1827, "Eugène_Delacroix_-_La_Mort_de_Sardanapale.jpg"],
  ["Women of Algiers", "Eugène Delacroix", 1834, "Eugène_Delacroix_-_Femmes_d'Alger_dans_leur_appartement.jpg"],
  ["Wanderer above the Sea of Fog", "Caspar David Friedrich", 1818, "Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg"],
  ["The Abbey in the Oakwood", "Caspar David Friedrich", 1810, "Caspar_David_Friedrich_-_Abtei_im_Eichwald_-_Google_Art_Project.jpg"],
  ["Chalk Cliffs on Rügen", "Caspar David Friedrich", 1818, "Caspar_David_Friedrich_-_Kreidefelsen_auf_Rügen_-_Google_Art_Project.jpg"],
  ["The Sea of Ice", "Caspar David Friedrich", 1824, "Caspar_David_Friedrich_-_Das_Eismeer_-_Hamburger_Kunsthalle_-_02.jpg"],
  ["Rain, Steam and Speed", "J.M.W. Turner", 1844, "Turner_-_Rain,_Steam_and_Speed_-_National_Gallery_file.jpg"],
  ["The Fighting Temeraire", "J.M.W. Turner", 1839, "The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg"],
  ["The Slave Ship", "J.M.W. Turner", 1840, "Slave-ship.jpg"],
  ["Snow Storm - Steam-Boat off a Harbour's Mouth", "J.M.W. Turner", 1842, "Joseph_Mallord_William_Turner_-_Snow_Storm_-_Steam-Boat_off_a_Harbour's_Mouth_-_WGA23178.jpg"],
  ["The Hay Wain", "John Constable", 1821, "John_Constable_-_The_Hay_Wain_(1821).jpg"],
  ["Salisbury Cathedral from the Meadows", "John Constable", 1831, "John_Constable_-_Salisbury_Cathedral_from_the_Meadows_-_Google_Art_Project.jpg"],
  ["The Raft of the Medusa", "Théodore Géricault", 1819, "JEAN_LOUIS_THÉODORE_GÉRICAULT_-_La_Balsa_de_la_Medusa_(Museo_del_Louvre,_1818-19).jpg"],
  ["The Nightmare", "Henry Fuseli", 1781, "John_Henry_Fuseli_-_The_Nightmare.jpg"],
  ["Ophelia", "John Everett Millais", 1852, "John_Everett_Millais_-_Ophelia_-_Google_Art_Project.jpg"],
  ["The Lady of Shalott", "John William Waterhouse", 1888, "John_William_Waterhouse_-_The_Lady_of_Shalott_-_Google_Art_Project_edit.jpg"],
  ["Hylas and the Nymphs", "John William Waterhouse", 1896, "Waterhouse_Hylas_and_the_Nymphs_Manchester_Art_Gallery_1896.15.jpg"],
  ["The Destruction of Pompeii and Herculaneum", "John Martin", 1822, "John_Martin_-_The_Destruction_of_Pompeii_and_Herculaneum_-_Google_Art_Project.jpg"],

  // =========================================================================
  // REALISM & PRE-RAPHAELITES (1840–1880)
  // =========================================================================
  ["The Gleaners", "Jean-François Millet", 1857, "Jean-François_Millet_-_Gleaners_-_Google_Art_Project_2.jpg"],
  ["The Angelus", "Jean-François Millet", 1859, "Jean-François_Millet_-_L'Angélus.jpg"],
  ["The Stone Breakers", "Gustave Courbet", 1850, "Gustave_Courbet_-_The_Stonebreakers_-_WGA05457.jpg"],
  ["A Burial at Ornans", "Gustave Courbet", 1850, "Gustave_Courbet_-_A_Burial_at_Ornans_-_Google_Art_Project_2.jpg"],
  ["The Origin of the World", "Gustave Courbet", 1866, "Origin-of-the-World.jpg"],
  ["The Artist's Studio", "Gustave Courbet", 1855, "Gustave_Courbet_-_The_Painter's_Studio_-_WGA05465.jpg"],
  ["The Horse Fair", "Rosa Bonheur", 1855, "Rosa_Bonheur_-_The_Horse_Fair_-_Google_Art_Project.jpg"],
  ["Arrangement in Grey and Black No.1", "James McNeill Whistler", 1871, "Whistlers_Mother_high_res.jpg"],
  ["Symphony in White No. 1", "James McNeill Whistler", 1862, "Whistler_James_Symphony_in_White_no_1_(The_White_Girl)_1862.jpg"],
  ["Nocturne in Black and Gold", "James McNeill Whistler", 1875, "Whistler-Nocturne_in_black_and_gold.jpg"],
  ["Christ in the House of His Parents", "John Everett Millais", 1850, "John_Everett_Millais_-_Christ_in_the_House_of_His_Parents_(`The_Carpenter's_Shop')_-_Google_Art_Project.jpg"],
  ["Proserpine", "Dante Gabriel Rossetti", 1874, "Dante_Gabriel_Rossetti_-_Proserpine_-_Google_Art_Project.jpg"],
  ["The Awakening Conscience", "William Holman Hunt", 1853, "William_Holman_Hunt_-_The_Awakening_Conscience_-_Google_Art_Project.jpg"],
  ["Work", "Ford Madox Brown", 1865, "Ford_Madox_Brown_-_Work_-_Google_Art_Project.jpg"],
  ["April Love", "Arthur Hughes", 1856, "Arthur_Hughes_-_April_Love_-_Google_Art_Project.jpg"],
  ["Flaming June", "Frederic Leighton", 1895, "Flaming_June,_by_Frederic_Lord_Leighton_(1830-1896).jpg"],

  // =========================================================================
  // IMPRESSIONISM (1860–1890)
  // =========================================================================
  ["Impression, Sunrise", "Claude Monet", 1872, "Claude_Monet,_Impression,_soleil_levant.jpg"],
  ["Water Lilies", "Claude Monet", 1906, "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg"],
  ["Water Lilies (Nymphéas)", "Claude Monet", 1916, "Claude_Monet_-_Water_Lilies_-_1916.jpg"],
  ["Water Lilies and Japanese Bridge", "Claude Monet", 1899, "Water-Lilies-and-Japanese-Bridge-(1897-1899)-Monet.jpg"],
  ["Haystacks (series)", "Claude Monet", 1891, "Claude_Monet_-_Meules_(W1273).jpg"],
  ["Rouen Cathedral", "Claude Monet", 1894, "Claude_Monet_-_Rouen_Cathedral,_Facade_(Sunset).jpg"],
  ["Woman with a Parasol", "Claude Monet", 1875, "Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg"],
  ["The Japanese Bridge", "Claude Monet", 1899, "Bridge_over_a_Pond_of_Water_Lilies,_Claude_Monet_1899.jpg"],
  ["San Giorgio Maggiore at Dusk", "Claude Monet", 1908, "Claude_Monet_-_San_Giorgio_Maggiore_at_Dusk.jpg"],
  ["The Houses of Parliament", "Claude Monet", 1904, "Claude_Monet_-_Houses_of_Parliament,_London.jpg"],
  ["La Grenouillère", "Claude Monet", 1869, "La_Grenouillère_MET_DT833.jpg"],
  ["Poppies", "Claude Monet", 1873, "Claude_Monet_-_Coquelicots.jpg"],
  ["Le Déjeuner sur l'herbe", "Édouard Manet", 1863, "Edouard_Manet_-_Luncheon_on_the_Grass_-_Google_Art_Project.jpg"],
  ["Olympia", "Édouard Manet", 1863, "Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg"],
  ["A Bar at the Folies-Bergère", "Édouard Manet", 1882, "Edouard_Manet,_A_Bar_at_the_Folies-Bergère.jpg"],
  ["The Fifer", "Édouard Manet", 1866, "Edouard_Manet_-_The_Fifer_-_Google_Art_Project.jpg"],
  ["The Balcony", "Édouard Manet", 1869, "Edouard_Manet_-_The_Balcony_-_Google_Art_Project.jpg"],
  ["Music in the Tuileries", "Édouard Manet", 1862, "Edouard_Manet_-_Music_in_the_Tuileries_-_Google_Art_Project.jpg"],
  ["Berthe Morisot with a Bouquet of Violets", "Édouard Manet", 1872, "Edouard_Manet_-_Berthe_Morisot_With_a_Bouquet_of_Violets_-_Google_Art_Project.jpg"],
  ["Dance at Le moulin de la Galette", "Pierre-Auguste Renoir", 1876, "Pierre-Auguste_Renoir,_Le_Moulin_de_la_Galette.jpg"],
  ["Luncheon of the Boating Party", "Pierre-Auguste Renoir", 1881, "Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg"],
  ["Dance at Bougival", "Pierre-Auguste Renoir", 1883, "Pierre-Auguste_Renoir_-_Dance_at_Bougival_-_Google_Art_Project.jpg"],
  ["Two Sisters (On the Terrace)", "Pierre-Auguste Renoir", 1881, "Pierre-Auguste_Renoir_-_Two_Sisters_(On_the_Terrace)_-_Google_Art_Project.jpg"],
  ["The Large Bathers", "Pierre-Auguste Renoir", 1887, "Pierre-Auguste_Renoir_-_The_Large_Bathers.jpg"],
  ["Nude in the Sun", "Pierre-Auguste Renoir", 1876, "Pierre-Auguste_Renoir_-_Torse,_effet_de_soleil.jpg"],
  ["The Swing", "Pierre-Auguste Renoir", 1876, "Pierre-Auguste_Renoir_-_The_Swing_-_Google_Art_Project.jpg"],
  ["Ballet Rehearsal", "Edgar Degas", 1874, "Edgar_Degas_-_The_Ballet_Class_-_Google_Art_Project.jpg"],
  ["The Star (L'Étoile)", "Edgar Degas", 1878, "Edgar_Germain_Hilaire_Degas_-_Star.jpg"],
  ["The Absinthe Drinker", "Edgar Degas", 1876, "Edgar_Degas_-_In_a_Café_-_Google_Art_Project_2.jpg"],
  ["Little Dancer of Fourteen Years", "Edgar Degas", 1881, "SFMOMA_Degas_Little_Dancer.jpg"],
  ["Blue Dancers", "Edgar Degas", 1897, "Edgar_Degas_-_Blue_Dancers_-_Google_Art_Project.jpg"],
  ["The Dance Class", "Edgar Degas", 1874, "Edgar_Degas_-_The_Dance_Class.jpg"],
  ["La Loge", "Pierre-Auguste Renoir", 1874, "Pierre-Auguste_Renoir_-_La_loge_-_Google_Art_Project.jpg"],
  ["A Sunday on La Grande Jatte", "Georges Seurat", 1886, "A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg"],
  ["Bathers at Asnières", "Georges Seurat", 1884, "Georges_Seurat_-_Bathers_at_Asnières_-_Google_Art_Project.jpg"],
  ["The Cradle", "Berthe Morisot", 1872, "Berthe_Morisot_-_The_Cradle_-_Google_Art_Project.jpg"],
  ["Young Woman in a Garden", "Berthe Morisot", 1884, "Berthe_Morisot_-_In_the_Garden_at_Maurecourt.jpg"],
  ["The Floor Scrapers", "Gustave Caillebotte", 1875, "Gustave_Caillebotte_-_The_Floor_Planers_-_Google_Art_Project.jpg"],
  ["Paris Street; Rainy Day", "Gustave Caillebotte", 1877, "Gustave_Caillebotte_-_Jour_de_pluie_à_Paris.jpg"],
  ["The Boulevard Montmartre at Night", "Camille Pissarro", 1897, "Camille_Pissarro_-_Boulevard_Montmartre_-_Nuit.jpg"],
  ["Red Roofs", "Camille Pissarro", 1877, "Camille_Pissarro_-_The_Red_Roofs.jpg"],
  ["The Garden at Pontoise", "Camille Pissarro", 1877, "Camille_Pissarro_-_Le_jardin_à_Pontoise.jpg"],
  ["Regatta at Molesey", "Alfred Sisley", 1874, "Alfred_Sisley_-_Molesey_Weir_-_Morning.jpg"],
  ["Flood at Port-Marly", "Alfred Sisley", 1876, "Alfred_Sisley_012.jpg"],

  // =========================================================================
  // POST-IMPRESSIONISM (1880–1910)
  // =========================================================================
  ["The Starry Night", "Vincent van Gogh", 1889, "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg"],
  ["Starry Night Over the Rhône", "Vincent van Gogh", 1888, "Starry_Night_Over_the_Rhone.jpg"],
  ["Sunflowers", "Vincent van Gogh", 1888, "Vincent_Willem_van_Gogh_127.jpg"],
  ["Café Terrace at Night", "Vincent van Gogh", 1888, "Vincent_Willem_van_Gogh_-_Cafe_Terrace_at_Night_(Yorck).jpg"],
  ["Bedroom in Arles", "Vincent van Gogh", 1888, "Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg"],
  ["Self-Portrait with Bandaged Ear", "Vincent van Gogh", 1889, "Vincent_van_Gogh_-_Self-Portrait_with_Bandaged_Ear.jpg"],
  ["The Potato Eaters", "Vincent van Gogh", 1885, "Van-willem-vincent-gogh-die-kartoffelesser-03850.jpg"],
  ["Irises", "Vincent van Gogh", 1889, "Irises-Vincent_van_Gogh.jpg"],
  ["Almond Blossom", "Vincent van Gogh", 1890, "Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg"],
  ["Wheatfield with Crows", "Vincent van Gogh", 1890, "Vincent_van_Gogh_-_Wheatfield_with_crows_-_Google_Art_Project.jpg"],
  ["The Church at Auvers", "Vincent van Gogh", 1890, "Vincent_van_Gogh_-_The_Church_in_Auvers-sur-Oise,_View_from_the_Chevet_-_Google_Art_Project.jpg"],
  ["The Night Café", "Vincent van Gogh", 1888, "Vincent_Willem_van_Gogh_076.jpg"],
  ["Self-Portrait", "Vincent van Gogh", 1889, "Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_(454045).jpg"],
  ["The Red Vineyard", "Vincent van Gogh", 1888, "Gogh,_Vincent_van_-_The_Red_Vineyard_-_Google_Art_Project.jpg"],
  ["The Sower", "Vincent van Gogh", 1888, "Vincent_van_Gogh_-_The_Sower_(1888,_Kröller-Müller_Museum).jpg"],
  ["Mont Sainte-Victoire", "Paul Cézanne", 1887, "Paul_Cézanne_-_La_Montagne_Sainte-Victoire_vue_du_bosquet_du_Château_Noir.jpg"],
  ["The Card Players", "Paul Cézanne", 1895, "Paul_Cézanne_-_Les_Joueurs_de_cartes.jpg"],
  ["The Large Bathers", "Paul Cézanne", 1906, "Paul_Cézanne_-_Les_Grandes_Baigneuses.jpg"],
  ["Still Life with Apples", "Paul Cézanne", 1898, "Paul_Cézanne_-_Nature_morte_aux_pommes_et_aux_oranges.jpg"],
  ["Boy in a Red Waistcoat", "Paul Cézanne", 1890, "Paul_Cézanne_-_Boy_in_a_Red_Waistcoat.jpg"],
  ["The Basket of Apples", "Paul Cézanne", 1895, "Paul_Cézanne_-_The_Basket_of_Apples_-_1893.jpg"],
  ["Where Do We Come From", "Paul Gauguin", 1898, "Paul_Gauguin_-_D'ou_venons-nous.jpg"],
  ["The Yellow Christ", "Paul Gauguin", 1889, "Paul_Gauguin_-_The_Yellow_Christ_-_Google_Art_Project.jpg"],
  ["Vision After the Sermon", "Paul Gauguin", 1888, "Paul_Gauguin_-_Vision_After_the_Sermon_(Jacob_Wrestling_with_the_Angel)_-_WGA8423.jpg"],
  ["Spirit of the Dead Watching", "Paul Gauguin", 1892, "Paul_Gauguin_-_Spirit_of_the_Dead_Watching_-_Google_Art_Project.jpg"],
  ["Tahitian Women on the Beach", "Paul Gauguin", 1891, "Paul_Gauguin_-_Femmes_de_Tahiti.jpg"],
  ["Two Tahitian Women", "Paul Gauguin", 1899, "Paul_Gauguin_-_Two_Tahitian_Women.jpg"],
  ["Arearea", "Paul Gauguin", 1892, "Paul_Gauguin_-_Arearea_-_Google_Art_Project.jpg"],
  ["At the Moulin Rouge", "Henri de Toulouse-Lautrec", 1895, "Henri_de_Toulouse-Lautrec_-_At_the_Moulin_Rouge_-_Google_Art_Project.jpg"],
  ["Jane Avril", "Henri de Toulouse-Lautrec", 1893, "Lautrec_jane_avril_(poster)_1893.jpg"],
  ["The Circus", "Georges Seurat", 1891, "Georges_Seurat_-_Le_Cirque.jpg"],
  ["The Models", "Georges Seurat", 1888, "Georges_Seurat_-_Les_Poseuses.jpg"],
  ["The Talisman", "Paul Sérusier", 1888, "Paul_Sérusier_-_Le_Talisman_-_Google_Art_Project.jpg"],
  ["The Scream", "Edvard Munch", 1893, "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg"],
  ["Madonna", "Edvard Munch", 1894, "Edvard_Munch_-_Madonna_-_Google_Art_Project.jpg"],
  ["The Dance of Life", "Edvard Munch", 1900, "Edvard_Munch_-_The_Dance_of_Life_(1899-1900).jpg"],
  ["Vampire", "Edvard Munch", 1895, "Edvard_Munch_-_Vampire_(1895)_-_Google_Art_Project.jpg"],
  ["Anxiety", "Edvard Munch", 1894, "Edvard_Munch_-_Anxiety_-_Google_Art_Project.jpg"],
  ["The Sick Child", "Edvard Munch", 1886, "Edvard_Munch_-_The_Sick_Child_(1886)_-_Google_Art_Project.jpg"],

  // =========================================================================
  // SYMBOLISM & ART NOUVEAU (1880–1910)
  // =========================================================================
  ["The Kiss", "Gustav Klimt", 1908, "Gustav_Klimt_-_The_Kiss_-_Google_Art_Project.jpg"],
  ["Portrait of Adele Bloch-Bauer I", "Gustav Klimt", 1907, "Gustav_Klimt_046.jpg"],
  ["The Tree of Life", "Gustav Klimt", 1909, "Gustav_Klimt_-_Der_Lebensbaum.jpg"],
  ["Judith and the Head of Holofernes", "Gustav Klimt", 1901, "Gustav_Klimt_039.jpg"],
  ["Death and Life", "Gustav Klimt", 1915, "Gustav_Klimt_-_Death_and_Life_-_Google_Art_Project.jpg"],
  ["Danaë", "Gustav Klimt", 1907, "Klimt_-_Danae.jpg"],
  ["Portrait of Adele Bloch-Bauer II", "Gustav Klimt", 1912, "Gustav_Klimt_047.jpg"],
  ["The Cyclops", "Odilon Redon", 1914, "Odilon_Redon_-_The_Cyclops_-_Google_Art_Project.jpg"],
  ["The Eye Like a Strange Balloon", "Odilon Redon", 1882, "Odilon_Redon_-_The_Eye_Like_a_Strange_Balloon_Mounts_toward_Infinity.jpg"],
  ["The Island of the Dead", "Arnold Böcklin", 1883, "Arnold_Böcklin_-_Die_Toteninsel_III_(Alte_Nationalgalerie,_Berlin).jpg"],
  ["The Sacred Wood", "Pierre Puvis de Chavannes", 1884, "Pierre_Puvis_de_Chavannes_-_The_Sacred_Grove,_Beloved_of_the_Arts_and_the_Muses_-_Google_Art_Project.jpg"],
  ["Salomé", "Gustave Moreau", 1876, "Gustave_Moreau_-_l'Apparition.jpg"],
  ["Hope I", "Gustav Klimt", 1903, "Gustav_Klimt_-_Hope,_I_-_Google_Art_Project.jpg"],
  ["Self-Portrait with Death Playing the Fiddle", "Arnold Böcklin", 1872, "Arnold_Böcklin_-_Selbstbildnis_mit_fiedelndem_Tod.jpg"],

  // =========================================================================
  // EXPRESSIONISM & FAUVISM (1900–1930)
  // =========================================================================
  ["The Dance", "Henri Matisse", 1910, "Matissedance.jpg"],
  ["Woman with a Hat", "Henri Matisse", 1905, "Matisse-Woman-with-a-Hat.jpg"],
  ["The Red Studio", "Henri Matisse", 1911, "Henri_Matisse_-_Le_bonheur_de_vivre_(The_Joy_of_Life).jpg"],
  ["Blue Nude II", "Henri Matisse", 1952, "Henri_Matisse_Blue_Nude_1952.jpg"],
  ["The Joy of Life", "Henri Matisse", 1906, "Henri_Matisse,_1905-06,_Le_bonheur_de_vivre,_Barnes_Foundation.jpg"],
  ["Open Window at Collioure", "Henri Matisse", 1905, "Henri_Matisse,_1905,_Open_Window,_Collioure,_Collection_of_Mrs._John_Hay_Whitney.jpg"],
  ["Self-Portrait", "Egon Schiele", 1912, "Egon_Schiele_-_Self-Portrait_with_Physalis_-_Google_Art_Project.jpg"],
  ["The Embrace", "Egon Schiele", 1917, "Egon_Schiele_-_The_Embrace_-_Google_Art_Project.jpg"],
  ["Death and the Maiden", "Egon Schiele", 1915, "Egon_Schiele_-_Death_and_the_Maiden_-_Google_Art_Project.jpg"],
  ["Seated Woman with Bent Knee", "Egon Schiele", 1917, "Egon_Schiele_-_Seated_Woman_with_Bent_Knee_-_Google_Art_Project.jpg"],
  ["The Blue Rider", "Wassily Kandinsky", 1903, "Kandinsky_-_Der_Blaue_Reiter.jpg"],
  ["Composition VII", "Wassily Kandinsky", 1913, "Vassily_Kandinsky,_1913_-_Composition_7.jpg"],
  ["Composition VIII", "Wassily Kandinsky", 1923, "Vassily_Kandinsky,_1923_-_Composition_8,_huile_sur_toile,_140_cm_x_201_cm,_Musée_Guggenheim,_New_York.jpg"],
  ["Several Circles", "Wassily Kandinsky", 1926, "Vassily_Kandinsky,_1926_-_Several_Circles,_Gugg_0910_25.jpg"],
  ["Yellow-Red-Blue", "Wassily Kandinsky", 1925, "Kandinsky_-_Gelb-Rot-Blau.jpg"],
  ["On White II", "Wassily Kandinsky", 1923, "Vassily_Kandinsky,_1923_-_On_White_II.jpg"],
  ["Street, Berlin", "Ernst Ludwig Kirchner", 1913, "Ernst_Ludwig_Kirchner_-_Berlin_Street_Scene_1913.jpg"],
  ["Self-Portrait as a Soldier", "Ernst Ludwig Kirchner", 1915, "Ernst_Ludwig_Kirchner_-_Selbstbildnis_als_Soldat.jpg"],
  ["The Large Blue Horses", "Franz Marc", 1911, "Franz_Marc_-_Die_großen_blauen_Pferde.jpg"],
  ["The Tower of Blue Horses", "Franz Marc", 1913, "Franz_Marc_-_The_Tower_of_Blue_Horses.jpg"],
  ["The Fate of the Animals", "Franz Marc", 1913, "Franz_Marc_-_Tierschicksale_-_Google_Art_Project.jpg"],
  ["Woman Before a Mirror", "Ernst Ludwig Kirchner", 1912, "Ernst_Ludwig_Kirchner_-_Mädchen_vor_dem_Spiegel_-_Google_Art_Project.jpg"],
  ["Houses at L'Estaque", "Georges Braque", 1908, "Georges_Braque,_1908,_Maisons_à_l'Estaque_(Houses_at_l'Estaque),_oil_on_canvas,_73_x_60_cm,_Kunstmuseum_Bern.jpg"],
  ["Violin and Candlestick", "Georges Braque", 1910, "Georges_Braque,_1910,_Violin_and_Candlestick,_oil_on_canvas,_60.96_x_50.17_cm,_San_Francisco_Museum_of_Modern_Art.jpg"],
  ["Bird in Space", "Constantin Brâncuși", 1923, "Brancusi_bird_in_space_1924.jpg"],
  ["The Old Guitarist", "Pablo Picasso", 1904, "Old_guitarist_chicago.jpg"],
  ["Les Demoiselles d'Avignon", "Pablo Picasso", 1907, "Les_Demoiselles_d'Avignon.jpg"],
  ["Guernica", "Pablo Picasso", 1937, "PicassoGuernica.jpg"],
  ["Girl Before a Mirror", "Pablo Picasso", 1932, "Pablo_Picasso,_1932,_Girl_before_a_Mirror.jpg"],
  ["The Weeping Woman", "Pablo Picasso", 1937, "Picasso_The_Weeping_Woman_Tate_identifier_T05010_10.jpg"],
  ["Three Musicians", "Pablo Picasso", 1921, "Pablo_Picasso_-_Three_Musicians_-_MoMA.jpg"],
  ["La Vie", "Pablo Picasso", 1903, "Pablo_Picasso,_1903,_La_Vie_(Life).jpg"],
  ["The Dream", "Pablo Picasso", 1932, "Pablo_Picasso,_1932,_Le_Rêve.jpg"],
  ["Seated Woman", "Pablo Picasso", 1937, "Pablo_Picasso_-_Femme_assise.jpg"],
  ["The Tragedy", "Pablo Picasso", 1903, "Pablo_Picasso,_1903,_The_Tragedy.jpg"],
  ["Ma Jolie", "Pablo Picasso", 1912, "Pablo_Picasso,_1911-12,_Ma_Jolie,_oil_on_canvas,_100_x_65.4_cm,_Museum_of_Modern_Art,_New_York.jpg"],
  ["Boy with a Pipe", "Pablo Picasso", 1905, "Garçon_à_la_pipe.jpg"],
  ["Family of Saltimbanques", "Pablo Picasso", 1905, "Pablo_Picasso,_1905,_Family_of_Saltimbanques_(Famille_de_saltimbanques).jpg"],
  ["Nude Descending a Staircase No. 2", "Marcel Duchamp", 1912, "Duchamp_-_Nude_Descending_a_Staircase.jpg"],
  ["Fountain", "Marcel Duchamp", 1917, "Marcel_Duchamp,_1917,_Fountain,_photograph_by_Alfred_Stieglitz.jpg"],

  // =========================================================================
  // SURREALISM & DADA (1920–1950)
  // =========================================================================
  ["The Persistence of Memory", "Salvador Dalí", 1931, "The_Persistence_of_Memory.jpg"],
  ["Swans Reflecting Elephants", "Salvador Dalí", 1937, "Swans_reflecting_elephants.jpg"],
  ["The Elephants", "Salvador Dalí", 1948, "Salvador_Dalí_-_The_Elephants.jpg"],
  ["The Burning Giraffe", "Salvador Dalí", 1937, "Burning_giraffe.jpg"],
  ["The Great Masturbator", "Salvador Dalí", 1929, "Salvador_Dalí_-_The_Great_Masturbator.jpg"],
  ["Galatea of the Spheres", "Salvador Dalí", 1952, "Galatea_of_the_Spheres.jpg"],
  ["Christ of Saint John of the Cross", "Salvador Dalí", 1951, "Christ_of_Saint_John_of_the_Cross.jpg"],
  ["The Son of Man", "René Magritte", 1964, "Magritte_TheSonOfMan.jpg"],
  ["The Treachery of Images", "René Magritte", 1929, "MasP.jpg"],
  ["The Lovers", "René Magritte", 1928, "Magritte_TheLovers.jpg"],
  ["Golconda", "René Magritte", 1953, "Magritte_Golconda.jpg"],
  ["The Empire of Light", "René Magritte", 1954, "René_Magritte_-_l'Empire_des_lumières.jpg"],
  ["The Human Condition", "René Magritte", 1933, "Magritte_TheHumanCondition.jpg"],
  ["Personal Values", "René Magritte", 1952, "René_Magritte_Personal_Values.jpg"],
  ["Time Transfixed", "René Magritte", 1938, "René_Magritte_Time_Transfixed.jpg"],
  ["The False Mirror", "René Magritte", 1929, "Magritte_FalseMirror.jpg"],
  ["The Harlequin's Carnival", "Joan Miró", 1925, "Joan_Miró,_1924-25,_Carnaval_d'Arlequin.jpg"],
  ["The Farm", "Joan Miró", 1922, "Joan_Miró_-_La_Masia.jpg"],
  ["Constellations", "Joan Miró", 1941, "Miró_-_The_Beautiful_Bird_Revealing_the_Unknown_to_a_Pair_of_Lovers.jpg"],
  ["Blue II", "Joan Miró", 1961, "Joan_Miró_-_Bleu_II.jpg"],
  ["Celebes", "Max Ernst", 1921, "The_Elephant_Celebes.jpg"],
  ["The Robing of the Bride", "Max Ernst", 1940, "Max_Ernst_-_The_Robing_of_the_Bride.jpg"],
  ["Europe After the Rain II", "Max Ernst", 1942, "Max_Ernst,_Europe_After_the_Rain_II.jpg"],
  ["The Elephants", "Max Ernst", 1948, "Max_Ernst,_1948,_The_Temptation_of_Saint_Anthony.jpg"],
  ["Birthday", "Dorothea Tanning", 1942, "Birthday-Dorothea_Tanning.jpg"],
  ["Object (Luncheon in Fur)", "Meret Oppenheim", 1936, "Meret_Oppenheim_-_Object_-_MoMA.jpg"],
  ["I and the Village", "Marc Chagall", 1911, "Marc_Chagall,_1911,_I_and_the_Village,_oil_on_canvas,_192.1_x_151.4_cm,_Museum_of_Modern_Art,_New_York.jpg"],
  ["Over the Town", "Marc Chagall", 1918, "Marc_Chagall_-_Over_the_Town.jpg"],
  ["The Promenade", "Marc Chagall", 1918, "Chagall_Walking.jpg"],
  ["The Birthday", "Marc Chagall", 1915, "Marc_Chagall,_1915,_Birthday_(Anniversaire).jpg"],
  ["The Bride of the Wind", "Oskar Kokoschka", 1914, "Oskar_Kokoschka_-_The_Bride_of_the_Wind.jpg"],
  ["The Snail", "Henri Matisse", 1953, "Henri_Matisse_-_The_Snail_1953.jpg"],

  // =========================================================================
  // ABSTRACT ART & DE STIJL (1910–1960)
  // =========================================================================
  ["Composition with Red Blue and Yellow", "Piet Mondrian", 1930, "Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg"],
  ["Broadway Boogie Woogie", "Piet Mondrian", 1943, "Piet_Mondrian,_1942_-_Broadway_Boogie_Woogie.jpg"],
  ["Composition II in Red Blue and Yellow", "Piet Mondrian", 1929, "Piet_Mondriaan_-_Compositie_met_rood,_geel_en_blauw.jpg"],
  ["Gray Tree", "Piet Mondrian", 1912, "Piet_Mondrian,_1911,_Gray_Tree_(De_grijze_boom),_oil_on_canvas,_79.7_x_109.1_cm,_Gemeentemuseum_Den_Haag,_Netherlands.jpg"],
  ["Black Square", "Kazimir Malevich", 1915, "Kazimir_Malevich,_1915,_Black_Suprematic_Square,_oil_on_linen_canvas,_79.5_x_79.5_cm,_Tretyakov_Gallery,_Moscow.jpg"],
  ["White on White", "Kazimir Malevich", 1918, "Malevich.white-on-white.jpg"],
  ["Suprematist Composition", "Kazimir Malevich", 1916, "Kazimir_Malevich_-_Suprematism_(Supremus_No._58)_-_Google_Art_Project.jpg"],
  ["Homage to the Square", "Josef Albers", 1962, "Josef_Albers's_painting_'Homage_to_the_Square',_1965.jpg"],
  ["Tableau I", "Piet Mondrian", 1921, "Tableau_I,_by_Piet_Mondriaan.jpg"],
  ["No. 5, 1948", "Jackson Pollock", 1948, "No._5,_1948.jpg"],
  ["Convergence", "Jackson Pollock", 1952, "Jackson_Pollock_-_Convergence.jpg"],
  ["Autumn Rhythm", "Jackson Pollock", 1950, "Pollock_Autumn_Rhythm.jpg"],
  ["Blue Poles", "Jackson Pollock", 1952, "Blue_Poles_(Jackson_Pollock).jpg"],
  ["No. 61 (Rust and Blue)", "Mark Rothko", 1953, "No._61_(Rust_and_Blue).jpg"],
  ["Orange, Red, Yellow", "Mark Rothko", 1961, "Mark_Rothko,_Orange,_Red,_Yellow,_1961.jpg"],
  ["No. 14", "Mark Rothko", 1960, "Mark_Rothko_-_No_14.jpg"],
  ["White Center", "Mark Rothko", 1950, "Mark_Rothko_-_White_Center.jpg"],
  ["Woman I", "Willem de Kooning", 1952, "Woman_I.jpg"],
  ["Excavation", "Willem de Kooning", 1950, "De_Kooning_Excavation.jpg"],
  ["Mountains and Sea", "Helen Frankenthaler", 1952, "Frankenthalerountainsandsea.jpg"],
  ["Elegy to the Spanish Republic", "Robert Motherwell", 1958, "Robert_Motherwell's_'Elegy_to_the_Spanish_Republic_No._110'.jpg"],
  ["Vir Heroicus Sublimis", "Barnett Newman", 1951, "Barnett_Newman_-_Vir_Heroicus_Sublimis.jpg"],
  ["Who's Afraid of Red, Yellow and Blue", "Barnett Newman", 1966, "Barnett_Newman_-_Who's_Afraid_of_Red,_Yellow_and_Blue.jpg"],
  ["Untitled (Black on Grey)", "Mark Rothko", 1970, "Mark_Rothko_Untitled_1969.jpg"],

  // =========================================================================
  // AMERICAN ART (1800–1970)
  // =========================================================================
  ["American Gothic", "Grant Wood", 1930, "Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg"],
  ["Christina's World", "Andrew Wyeth", 1948, "Christina's_World.jpg"],
  ["Nighthawks", "Edward Hopper", 1942, "Nighthawks_by_Edward_Hopper_1942.jpg"],
  ["Automat", "Edward Hopper", 1927, "Edward_Hopper_Automat_1927.jpg"],
  ["Morning Sun", "Edward Hopper", 1952, "Edward_Hopper_Morning_Sun.jpg"],
  ["Gas", "Edward Hopper", 1940, "Edward_Hopper_Gas_1940.jpg"],
  ["Chop Suey", "Edward Hopper", 1929, "Edward_Hopper_Chop_Suey.jpg"],
  ["Office at Night", "Edward Hopper", 1940, "Edward_Hopper_-_Office_at_Night.jpg"],
  ["New York Movie", "Edward Hopper", 1939, "New_York_Movie_1939_Edward_Hopper.jpg"],
  ["Cape Cod Evening", "Edward Hopper", 1939, "Edward_Hopper_Cape_Cod_Evening.jpg"],
  ["Black Iris", "Georgia O'Keeffe", 1926, "Georgia_O'Keeffe_-_Black_Iris_III_1926.jpg"],
  ["Jimson Weed", "Georgia O'Keeffe", 1936, "Georgia_O'Keeffe_-_Jimson_Weed.jpg"],
  ["Sky Above Clouds IV", "Georgia O'Keeffe", 1965, "Georgia_O'Keeffe_-_Sky_above_Clouds_IV.jpg"],
  ["Ram's Head White Hollyhock and Little Hills", "Georgia O'Keeffe", 1935, "Brooklyn_Museum_-_Ram's_Head_White_Hollyhock_and_Little_Hills_-_Georgia_O'Keeffe.jpg"],
  ["Freedom from Want", "Norman Rockwell", 1943, "Norman_Rockwell_-_Freedom_from_Want.jpg"],
  ["Triple Self-Portrait", "Norman Rockwell", 1960, "Norman_Rockwell_-_Triple_Self-Portrait.jpg"],
  ["The Problem We All Live With", "Norman Rockwell", 1964, "The-problem-we-all-live-with-norman-rockwell.jpg"],
  ["Washington Crossing the Delaware", "Emanuel Leutze", 1851, "Washington_Crossing_the_Delaware_by_Emanuel_Leutze,_MMA-NYC,_1851.jpg"],
  ["Breezing Up", "Winslow Homer", 1876, "Winslow_Homer_-_Breezing_Up_(A_Fair_Wind)_-_Google_Art_Project.jpg"],
  ["The Gulf Stream", "Winslow Homer", 1899, "Winslow_Homer_-_The_Gulf_Stream_-_Metropolitan_Museum_of_Art.jpg"],
  ["Snap the Whip", "Winslow Homer", 1872, "Winslow_Homer_-_Snap_the_Whip_(Butler_Institute_of_American_Art).jpg"],
  ["The Oxbow", "Thomas Cole", 1836, "Cole_Thomas_The_Oxbow_(The_Connecticut_River_near_Northampton_1836).jpg"],
  ["The Voyage of Life: Youth", "Thomas Cole", 1842, "Thomas_Cole_-_The_Voyage_of_Life_Youth,_1842_(National_Gallery_of_Art).jpg"],
  ["Watson and the Shark", "John Singleton Copley", 1778, "Watson_and_the_Shark_(1778).jpg"],
  ["The Heart of the Andes", "Frederic Edwin Church", 1859, "Frederic_Edwin_Church_-_Heart_of_the_Andes_-_Google_Art_Project.jpg"],
  ["Fur Traders Descending the Missouri", "George Caleb Bingham", 1845, "George_Caleb_Bingham_-_Fur_Traders_Descending_the_Missouri.jpg"],
  ["The Peaceable Kingdom", "Edward Hicks", 1826, "Edward_Hicks_-_Peaceable_Kingdom.jpg"],

  // =========================================================================
  // POP ART & CONTEMPORARY (1950–1980)
  // =========================================================================
  ["Campbell's Soup Cans", "Andy Warhol", 1962, "Campbells_Soup_Cans_MOMA.jpg"],
  ["Marilyn Diptych", "Andy Warhol", 1962, "Marilyndiptych.jpg"],
  ["Shot Sage Blue Marilyn", "Andy Warhol", 1964, "Warhol-Shot_Sage_Blue_Marilyn.jpg"],
  ["Drowning Girl", "Roy Lichtenstein", 1963, "Roy_Lichtenstein_Drowning_Girl.jpg"],
  ["Whaam!", "Roy Lichtenstein", 1963, "Roy_Lichtenstein_Whaam.jpg"],
  ["Look Mickey", "Roy Lichtenstein", 1961, "Roy_Lichtenstein_-_Look_Mickey.jpg"],
  ["Just What Is It", "Richard Hamilton", 1956, "Hamilton-appealing2.jpg"],
  ["Flag", "Jasper Johns", 1955, "Flag_Jasper_Johns.jpg"],
  ["Three Flags", "Jasper Johns", 1958, "Jasper_Johns's_'Three_Flags',_1958.jpg"],
  ["A Bigger Splash", "David Hockney", 1967, "A_Bigger_Splash.jpg"],
  ["Portrait of an Artist (Pool with Two Figures)", "David Hockney", 1972, "David_Hockney_-_Portrait_of_an_Artist_(Pool_with_Two_Figures).jpg"],
  ["Mr and Mrs Clark and Percy", "David Hockney", 1971, "Mr_and_Mrs_Clark_and_Percy.jpg"],
  ["Love", "Robert Indiana", 1966, "LOVE_sculpture_NY.JPG"],
  ["One: Number 31", "Jackson Pollock", 1950, "One-No31,_Jackson_Pollock.jpg"],
  ["Orange and Yellow", "Mark Rothko", 1956, "Mark_Rothko,_Orange_and_Yellow,_1956.jpg"],
  ["Nightsea", "Agnes Martin", 1963, "Agnes_Martin_-_Nightsea.jpg"],

  // =========================================================================
  // JAPANESE ART (UKIYO-E & OTHERS)
  // =========================================================================
  ["The Great Wave off Kanagawa", "Katsushika Hokusai", 1831, "Tsunami_by_hokusai_19th_century.jpg"],
  ["South Wind, Clear Sky (Red Fuji)", "Katsushika Hokusai", 1831, "Fine_Wind,_Clear_Morning.jpg"],
  ["Thunderstorm Beneath the Summit", "Katsushika Hokusai", 1831, "Lightnings_below_the_summit.jpg"],
  ["Ejiri in Suruga Province", "Katsushika Hokusai", 1831, "Ejiri_in_Suruga_Province.jpg"],
  ["Dream of the Fisherman's Wife", "Katsushika Hokusai", 1814, "Tako_to_ama_retouched.jpg"],
  ["Sudden Shower over Shin-Ōhashi", "Utagawa Hiroshige", 1857, "Hiroshige_-_Evening_Shower_at_Atake_and_the_Great_Bridge.jpg"],
  ["Night Snow at Kambara", "Utagawa Hiroshige", 1834, "Hiroshige_-_Night_Snow_at_Kambara.jpg"],
  ["Plum Park in Kameido", "Utagawa Hiroshige", 1857, "Hiroshige_-_Plum_Garden_in_Kameido.jpg"],
  ["Moon over Seba", "Utagawa Hiroshige", 1834, "Hiroshige_Full_moon_over_a_mountain_landscape.jpg"],
  ["Iris Garden", "Utagawa Hiroshige", 1857, "Hiroshige_-_Horikiri_Iris_Garden.jpg"],
  ["Beauty Looking Back", "Hishikawa Moronobu", 1694, "Beauty_looking_back.jpg"],
  ["Fujin Raijin", "Tawaraya Sōtatsu", 1625, "Fujinraijin-tawaraya.jpg"],
  ["Pine Trees Screen", "Hasegawa Tōhaku", 1595, "Pine_Trees.jpg"],
  ["Thirty-six Views of Mount Fuji: Shore of Tago Bay", "Katsushika Hokusai", 1830, "Shore_of_Tago_Bay.jpg"],

  // =========================================================================
  // CHINESE ART
  // =========================================================================
  ["Along the River During the Qingming Festival", "Zhang Zeduan", 1120, "Alongtheriver_QingMing.jpg"],
  ["Dwelling in the Fuchun Mountains", "Huang Gongwang", 1350, "Huang_Gongwang_Fuchun_Shanju.jpg"],
  ["Early Spring", "Guo Xi", 1072, "Guo_Xi_-_Early_Spring_(large).jpg"],
  ["Travelers Among Mountains and Streams", "Fan Kuan", 1000, "Fan_Kuan_-_Travelers_Among_Mountains_and_Streams_-_Google_Art_Project.jpg"],
  ["A Thousand Li of Rivers and Mountains", "Wang Ximeng", 1113, "Wang_Ximeng._A_Thousand_Li_of_Rivers_and_Mountains..jpg"],

  // =========================================================================
  // MORE BAROQUE & 17TH CENTURY
  // =========================================================================
  ["The Milkmaid of Bordeaux", "Francisco Goya", 1827, "La_Lechera_de_Burdeos.jpg"],
  ["Witches' Sabbath", "Francisco Goya", 1798, "Francisco_de_Goya_y_Lucientes_-_Witches'_Sabbath_-_Google_Art_Project.jpg"],
  ["The Straw Manikin", "Francisco Goya", 1792, "El_pelele_(Goya).jpg"],
  ["Landscape with the Fall of Icarus", "Pieter Bruegel the Elder", 1558, "Pieter_Bruegel_de_Oude_-_De_val_van_Icarus.jpg"],
  ["The Harvesters", "Pieter Bruegel the Elder", 1565, "Pieter_Bruegel_the_Elder-_The_Harvesters_-_Google_Art_Project.jpg"],
  ["Children's Games", "Pieter Bruegel the Elder", 1560, "Pieter_Bruegel_the_Elder_-_Children's_Games_-_Google_Art_Project.jpg"],
  ["The Lute Player", "Caravaggio", 1596, "Michelangelo_Merisi_da_Caravaggio_-_The_Lute_Player_-_WGA04079.jpg"],
  ["The Incredulity of Saint Thomas", "Caravaggio", 1602, "The_Incredulity_of_Saint_Thomas_by_Caravaggio.jpg"],
  ["Boy Bitten by a Lizard", "Caravaggio", 1595, "Boy_bitten_by_a_lizard.jpg"],
  ["Magdalene in Ecstasy", "Caravaggio", 1606, "Caravaggio_-_Maddalena_in_estasi.jpg"],
  ["Judith and Her Maidservant", "Artemisia Gentileschi", 1625, "Artemisia_Gentileschi_-_Judith_and_Her_Maidservant_-_Google_Art_Project.jpg"],
  ["Self-Portrait as the Allegory of Painting", "Artemisia Gentileschi", 1639, "Self-portrait_as_the_Allegory_of_Painting_(La_Pittura)_-_Artemisia_Gentileschi.jpg"],
  ["The Lacemaker", "Caspar Netscher", 1664, "Caspar_Netscher_-_The_Lace-Maker_-_Google_Art_Project.jpg"],
  ["A Young Woman Standing at a Virginal", "Johannes Vermeer", 1672, "Johannes_Vermeer_-_Lady_Standing_at_a_Virginal.jpg"],
  ["The Concert", "Johannes Vermeer", 1664, "Vermeer_The_Concert.jpg"],
  ["Girl with a Flute", "Johannes Vermeer", 1666, "Johannes_Vermeer_-_Girl_with_a_Flute.jpg"],

  // =========================================================================
  // MORE IMPRESSIONISM & POST-IMPRESSIONISM
  // =========================================================================
  ["Gare Saint-Lazare", "Claude Monet", 1877, "Claude_Monet_-_The_Gare_Saint-Lazare,_Arrival_of_a_Train.jpg"],
  ["The Garden at Giverny", "Claude Monet", 1900, "Claude_Monet_-_Artist's_Garden_at_Giverny.jpg"],
  ["The Magpie", "Claude Monet", 1869, "Claude_Monet_-_The_Magpie_-_Google_Art_Project.jpg"],
  ["Women in the Garden", "Claude Monet", 1866, "Claude_Monet_024.jpg"],
  ["The Cliff Walk at Pourville", "Claude Monet", 1882, "Claude_Monet_-_Cliff_Walk_at_Pourville_-_Google_Art_Project.jpg"],
  ["The Water Lily Pond", "Claude Monet", 1900, "Claude_Monet_-_Le_bassin_aux_nymphéas.jpg"],
  ["Regatta at Argenteuil", "Claude Monet", 1872, "Claude_Monet_Regatta_at_Argenteuil.jpg"],
  ["The Walk", "Claude Monet", 1875, "Claude_Monet_-_The_Walk,_Woman_with_a_Parasol.jpg"],
  ["La Grenouillère", "Pierre-Auguste Renoir", 1869, "Pierre-Auguste_Renoir_-_La_Grenouillère.jpg"],
  ["The Umbrellas", "Pierre-Auguste Renoir", 1886, "Pierre-Auguste_Renoir_-_Les_Parapluies.jpg"],
  ["After the Bath", "Edgar Degas", 1898, "Edgar_Degas_-_After_the_Bath,_Woman_Drying_Herself_-_Google_Art_Project.jpg"],
  ["The Rehearsal", "Edgar Degas", 1874, "Edgar_Degas_-_The_Rehearsal_-_Google_Art_Project.jpg"],
  ["The Bellelli Family", "Edgar Degas", 1867, "Edgar_Degas_-_La_famille_Bellelli.jpg"],
  ["At the Races", "Edgar Degas", 1877, "Edgar_Degas_-_At_the_Races.jpg"],
  ["Starry Night Over the Rhone", "Vincent van Gogh", 1888, "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg"],
  ["The Yellow House", "Vincent van Gogh", 1888, "Vincent_van_Gogh_-_The_yellow_house_('The_street').jpg"],
  ["Self-Portrait with Grey Felt Hat", "Vincent van Gogh", 1887, "Vincent_van_Gogh_-_Self-portrait_with_grey_felt_hat_-_Google_Art_Project.jpg"],
  ["Wheat Field with Cypresses", "Vincent van Gogh", 1889, "Van_Gogh_-_A_Wheatfield_with_Cypresses.jpg"],
  ["Olive Trees", "Vincent van Gogh", 1889, "Van_Gogh_The_Olive_Trees..jpg"],
  ["Landscape at Saint-Rémy", "Vincent van Gogh", 1889, "Van_Gogh_-_Enclosed_Wheat_Field_with_Rising_Sun.jpg"],

  // =========================================================================
  // MORE MODERN ART
  // =========================================================================
  ["Improvisation 28", "Wassily Kandinsky", 1912, "Vassily_Kandinsky,_1912_-_Improvisation_27,_Garden_of_Love_II.jpg"],
  ["The Bride Stripped Bare", "Marcel Duchamp", 1923, "Duchamp_LargeGlass.jpg"],
  ["Painting", "Francis Bacon", 1946, "Bacon_Painting_1946.jpg"],
  ["Three Studies of Lucian Freud", "Francis Bacon", 1969, "Francis_Bacon_-_Three_Studies_of_Lucian_Freud.jpg"],
  ["Figure with Meat", "Francis Bacon", 1954, "Francis_Bacon_Figure_with_Meat.jpg"],
  ["Study after Velázquez's Portrait of Pope Innocent X", "Francis Bacon", 1953, "Study_after_Velazquez.jpg"],
  ["Benefits Supervisor Sleeping", "Lucian Freud", 1995, "Lucian_Freud_-_Benefits_Supervisor_Sleeping.jpg"],
  ["Two Forms", "Henry Moore", 1934, "Henry_Moore_-_Two_Forms_1934.jpg"],
  ["Girl with Balloon", "Banksy", 2002, "Banksy_Girl_and_Heart_Balloon_(2840632113).jpg"],
  ["Balloon Dog", "Jeff Koons", 1994, "Koons_Balloon_Dog.jpg"],

  // =========================================================================
  // MORE EXPRESSIONISM & EARLY MODERN
  // =========================================================================
  ["The Scream (pastel)", "Edvard Munch", 1895, "Edvard_Munch_-_The_Scream_-_Google_Art_Project.jpg"],
  ["Puberty", "Edvard Munch", 1895, "Edvard_Munch_-_Puberty_(1894-95).jpg"],
  ["Starry Night", "Edvard Munch", 1893, "Edvard_Munch_-_Starry_Night_(1893).jpg"],
  ["The Red Tower in Halle", "Ernst Ludwig Kirchner", 1915, "Ernst_Ludwig_Kirchner_-_Der_rote_Turm_in_Halle_-_Google_Art_Project.jpg"],
  ["Senecio", "Paul Klee", 1922, "Paul_Klee_-_Senecio.jpg"],
  ["Twittering Machine", "Paul Klee", 1922, "Klee_-_Zwitschermaschine.jpg"],
  ["Castle and Sun", "Paul Klee", 1928, "Paul_Klee_-_Castle_and_Sun.jpg"],
  ["Ad Parnassum", "Paul Klee", 1932, "Paul_Klee_-_Ad_Parnassum.jpg"],
  ["Fish Magic", "Paul Klee", 1925, "Paul_Klee_-_Fish_Magic.jpg"],
  ["The Sleeping Gypsy", "Henri Rousseau", 1897, "Henri_Rousseau_-_La_bohémienne_endormie.jpg"],
  ["The Dream", "Henri Rousseau", 1910, "Henri_Rousseau_-_Il_sogno.jpg"],
  ["Tiger in a Tropical Storm", "Henri Rousseau", 1891, "Rousseau-Surprised.jpg"],
  ["The Hungry Lion Throws Itself on the Antelope", "Henri Rousseau", 1905, "Henri_Rousseau_-_Il_leone_affamato.jpg"],
  ["Portrait of Joseph Roulin", "Vincent van Gogh", 1889, "Vincent_van_Gogh_-_Portrait_of_Joseph_Roulin_-_Google_Art_Project.jpg"],
  ["The Starry Night drawing", "Vincent van Gogh", 1889, "Van_Gogh_Starry_Night_Drawing.jpg"],
  ["Sunflowers (second version)", "Vincent van Gogh", 1889, "Vincent_van_Gogh_-_Sunflowers_-_VGM_F458.jpg"],

  // =========================================================================
  // ADDITIONAL RENAISSANCE & OLD MASTERS
  // =========================================================================
  ["The Annunciation", "Jan van Eyck", 1435, "Jan_van_Eyck_-_The_Annunciation_-_Google_Art_Project.jpg"],
  ["The Descent from the Cross", "Rogier van der Weyden", 1435, "Rogier_van_der_Weyden_-_Descent_from_the_Cross_-_WGA25027.jpg"],
  ["The Adoration of the Mystic Lamb", "Hubert and Jan van Eyck", 1432, "Retable_de_l'Agneau_mystique_(2).jpg"],
  ["Man in a Red Turban", "Jan van Eyck", 1433, "Portrait_of_a_Man_in_a_Turban_(Jan_van_Eyck)_with_frame.jpg"],
  ["The Crucifixion", "Matthias Grünewald", 1515, "Grunewald_Isenheim1.jpg"],
  ["The Isenheim Altarpiece", "Matthias Grünewald", 1516, "Isenheim_altarpiece.jpg"],
  ["Doni Tondo", "Michelangelo", 1507, "Michelangelo_Buonarroti_-_Tondo_Doni_-_Google_Art_Project.jpg"],
  ["The Entombment", "Michelangelo", 1501, "Michelangelo_-_The_Entombment_-_Google_Art_Project.jpg"],
  ["The Deposition", "Raphael", 1507, "Raffaello,_pala_baglioni,_deposizione.jpg"],
  ["The Alba Madonna", "Raphael", 1510, "Raphael_-_The_Alba_Madonna_-_Google_Art_Project.jpg"],
  ["Madonna of the Goldfinch", "Raphael", 1506, "Raffaello_Sanzio_-_Madonna_del_Cardellino_-_Google_Art_Project.jpg"],
  ["The Madonna of the Chair", "Raphael", 1514, "Raphael_-_Madonna_della_seggiola.jpg"],
  ["Judith with the Head of Holofernes", "Lucas Cranach the Elder", 1530, "Lucas_Cranach_d.Ä._-_Judith_mit_dem_Haupt_des_Holofernes.jpg"],
  ["Adam and Eve", "Lucas Cranach the Elder", 1528, "Lucas_Cranach_the_Elder_-_Adam_and_Eve_1528.jpg"],
  ["The Conversion of Saint Paul", "Pieter Bruegel the Elder", 1567, "Pieter_Bruegel_the_Elder_-_The_Conversion_of_Paul_-_WGA03496.jpg"],
  ["Census at Bethlehem", "Pieter Bruegel the Elder", 1566, "Pieter_Bruegel_the_Elder_-_The_Census_at_Bethlehem_-_WGA03379.jpg"],
  ["St. Jerome in His Study", "Albrecht Dürer", 1514, "Albrecht_Dürer_-_St_Jerome_in_his_Study_-_Google_Art_Project.jpg"],
  ["Knight, Death and the Devil", "Albrecht Dürer", 1513, "Albrecht_Dürer_-_Knight,_Death_and_the_Devil_(NGA_1943.3.3520).jpg"],
  ["The Assumption of the Virgin", "Correggio", 1530, "Antonio_da_Correggio_-_Assumption_of_the_Virgin_-_Google_Art_Project.jpg"],
  ["Jupiter and Io", "Correggio", 1532, "Correggio_-_Jupiter_and_Io_-_Google_Art_Project.jpg"],
  ["Bacchus and Ariadne", "Tintoretto", 1578, "Jacopo_Tintoretto_-_Bacchus_and_Ariadne_-_WGA22639.jpg"],
  ["Susanna and the Elders", "Tintoretto", 1555, "Jacopo_Robusti,_called_Tintoretto_-_Susanna_and_the_Elders_-_Google_Art_Project.jpg"],
  ["The Origin of the Milky Way", "Tintoretto", 1575, "Jacopo_Tintoretto_-_The_Origin_of_the_Milky_Way_-_Google_Art_Project.jpg"],

  // =========================================================================
  // ADDITIONAL BAROQUE & 18TH CENTURY
  // =========================================================================
  ["The Girl with a Wineglass", "Johannes Vermeer", 1660, "Johannes_Vermeer_-_The_Glass_of_Wine_-_Google_Art_Project.jpg"],
  ["Young Woman with a Water Pitcher", "Johannes Vermeer", 1662, "Johannes_Vermeer_-_Young_Woman_with_a_Water_Pitcher.jpg"],
  ["Self-Portrait", "Rembrandt", 1669, "Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project_(719137).jpg"],
  ["Man with the Golden Helmet", "Rembrandt", 1650, "Rembrandt_-_Man_in_a_Golden_Helmet_-_Google_Art_Project.jpg"],
  ["The Music Lesson", "Johannes Vermeer", 1665, "Jan_Vermeer_van_Delft_014.jpg"],
  ["Landscape with a Calm", "Nicolas Poussin", 1651, "Nicolas_Poussin_-_Landscape_with_a_Calm_-_Google_Art_Project.jpg"],
  ["Et in Arcadia ego", "Nicolas Poussin", 1638, "Nicolas_Poussin_-_Et_in_Arcadia_ego_(deuxième_version).jpg"],
  ["The Abduction of the Sabine Women", "Nicolas Poussin", 1634, "Nicolas_Poussin_-_L'Enlèvement_des_Sabines_(1634-5).jpg"],
  ["The Rape of Europa", "Titian", 1562, "Titian_-_Rape_of_Europa_-_Google_Art_Project.jpg"],
  ["Charles I at the Hunt", "Anthony van Dyck", 1635, "Anthony_van_Dyck_-_Charles_I_(1600-49)_with_M._de_St_Antoine_-_Google_Art_Project.jpg"],
  ["The Arnolfini Portrait detail", "Jan van Eyck", 1434, "The_Arnolfini_Portrait,_détail_(2).jpg"],
  ["The Infanta Margarita Teresa in a Blue Dress", "Diego Velázquez", 1659, "Diego_Velázquez_-_Infanta_Margarita_Teresa_in_a_Blue_Dress_-_Google_Art_Project.jpg"],
  ["Old Woman Frying Eggs", "Diego Velázquez", 1618, "Diego_Velázquez_-_Vieja_friendo_huevos.jpg"],
  ["The Waterseller of Seville", "Diego Velázquez", 1622, "Diego_Velázquez_-_The_Waterseller_of_Seville.jpg"],
  ["The Spinners", "Diego Velázquez", 1657, "Diego_Velázquez_-_Las_Hilanderas.jpg"],
  ["Susanna and the Elders", "Artemisia Gentileschi", 1610, "Artemisia_Gentileschi_-_Susanna_and_the_Elders_(1610).jpg"],
  ["The Judgment of Paris", "Peter Paul Rubens", 1639, "Peter_Paul_Rubens_-_The_Judgment_of_Paris_-_Google_Art_Project.jpg"],
  ["The Martyrdom of Saint Ursula", "Caravaggio", 1610, "Caravaggio_-_Martirio_di_sant'Orsola.jpg"],
  ["Las Hilanderas", "Diego Velázquez", 1657, "Velázquez_-_La_Fábula_de_Aracne_o_Las_Hilanderas_(Museo_del_Prado,_1657).jpg"],

  // =========================================================================
  // ADDITIONAL ROMANTICISM & 19TH CENTURY
  // =========================================================================
  ["The Wanderer", "Caspar David Friedrich", 1818, "Caspar_David_Friedrich_032.jpg"],
  ["Two Men Contemplating the Moon", "Caspar David Friedrich", 1820, "Caspar_David_Friedrich_-_Two_Men_Contemplating_the_Moon_-_Google_Art_Project.jpg"],
  ["Moonrise over the Sea", "Caspar David Friedrich", 1822, "Caspar_David_Friedrich_-_Mondaufgang_am_Meer_-_Google_Art_Project.jpg"],
  ["The Voyage of Life: Childhood", "Thomas Cole", 1842, "Thomas_Cole_-_The_Voyage_of_Life_Childhood,_1842_(National_Gallery_of_Art).jpg"],
  ["The Voyage of Life: Old Age", "Thomas Cole", 1842, "Thomas_Cole_-_The_Voyage_of_Life_Old_Age,_1842_(National_Gallery_of_Art).jpg"],
  ["Dante and Virgil in Hell", "William-Adolphe Bouguereau", 1850, "William-Adolphe_Bouguereau_(1825-1905)_-_Dante_And_Virgil_In_Hell_(1850).jpg"],
  ["The Birth of Venus", "William-Adolphe Bouguereau", 1879, "William-Adolphe_Bouguereau_(1825-1905)_-_The_Birth_of_Venus_(1879).jpg"],
  ["Nymphs and Satyr", "William-Adolphe Bouguereau", 1873, "William-Adolphe_Bouguereau_(1825-1905)_-_Nymphs_and_Satyr_(1873).jpg"],
  ["A Young Girl Defending Herself Against Eros", "William-Adolphe Bouguereau", 1880, "William-Adolphe_Bouguereau_(1825-1905)_-_A_Young_Girl_Defending_Herself_Against_Eros_(1880).jpg"],
  ["The Storm", "Pierre-Auguste Cot", 1880, "Pierre-Auguste_Cot_-_The_Storm.jpg"],
  ["Springtime", "Pierre-Auguste Cot", 1873, "Pierre_Auguste_Cot_-_Spring.jpg"],
  ["Peaceful Days", "Sophie Anderson", 1866, "Sophie_Gengembre_Anderson_-_No_Walk_Today.jpg"],
  ["A Soul Brought to Heaven", "William-Adolphe Bouguereau", 1878, "William-Adolphe_Bouguereau_(1825-1905)_-_Song_of_the_Angels_(1881).jpg"],
  ["Isabella and the Pot of Basil", "John William Waterhouse", 1907, "John_William_Waterhouse_-_Isabella_and_the_Pot_of_Basil.jpg"],
  ["The Magic Circle", "John William Waterhouse", 1886, "John_William_Waterhouse_-_Magic_Circle.JPG"],
  ["Echo and Narcissus", "John William Waterhouse", 1903, "John_William_Waterhouse_-_Echo_and_Narcissus_-_Google_Art_Project.jpg"],
  ["Circe Offering the Cup to Ulysses", "John William Waterhouse", 1891, "Circe_Offering_the_Cup_to_Ulysses.jpg"],
  ["Gather Ye Rosebuds While Ye May", "John William Waterhouse", 1909, "John_William_Waterhouse_-_Gather_Ye_Rosebuds_While_Ye_May.jpg"],
  ["A Mermaid", "John William Waterhouse", 1901, "John_William_Waterhouse_A_Mermaid.jpg"],
  ["Beata Beatrix", "Dante Gabriel Rossetti", 1870, "Dante_Gabriel_Rossetti_-_Beata_Beatrix,_1864-1870.jpg"],
  ["The Beloved", "Dante Gabriel Rossetti", 1866, "Dante_Gabriel_Rossetti_-_The_Bride_-_Google_Art_Project.jpg"],
  ["Ecce Ancilla Domini", "Dante Gabriel Rossetti", 1850, "Dante_Gabriel_Rossetti_-_Ecce_Ancilla_Domini!_-_Google_Art_Project.jpg"],
  ["Pygmalion and Galatea", "Jean-Léon Gérôme", 1890, "Jean-Léon_Gérôme_-_Pygmalion_and_Galatea_-_Google_Art_Project.jpg"],
  ["Pollice Verso", "Jean-Léon Gérôme", 1872, "Jean-Leon_Gerome_Pollice_Verso.jpg"],
  ["The Slave Market", "Jean-Léon Gérôme", 1866, "Jean-Léon_Gérôme_-_Slave_Market_-_Google_Art_Project.jpg"],

  // =========================================================================
  // ADDITIONAL 20TH CENTURY & BEYOND
  // =========================================================================
  ["The Two Fridas", "Frida Kahlo", 1939, "Frida_Kahlo_-_The_Two_Fridas.jpg"],
  ["Self-Portrait with Thorn Necklace", "Frida Kahlo", 1940, "Frida_Kahlo_(self_portrait).jpg"],
  ["The Broken Column", "Frida Kahlo", 1944, "Frida_Kahlo_-_The_Broken_Column.jpg"],
  ["Henry Ford Hospital", "Frida Kahlo", 1932, "Frida_Kahlo_-_Henry_Ford_Hospital.jpg"],
  ["Self-Portrait with Monkey", "Frida Kahlo", 1938, "Autorretrato_con_collar_de_espinas.jpg"],
  ["The Bus", "Frida Kahlo", 1929, "Frida_Kahlo_-_The_Bus.jpg"],
  ["Landscape with Butterflies", "Salvador Dalí", 1956, "Salvador_Dalí_-_Landscape_with_Butterflies.jpg"],
  ["Soft Construction with Boiled Beans", "Salvador Dalí", 1936, "Soft_construction_with_boiled_beans_(Premonition_of_Civil_War).jpg"],
  ["The Disintegration of the Persistence of Memory", "Salvador Dalí", 1954, "Salvador_Dalí_-_The_Disintegration_of_the_Persistence_of_Memory.jpg"],
  ["The Sacrament of the Last Supper", "Salvador Dalí", 1955, "The_Sacrament_of_the_Last_Supper_-_Dalí.jpg"],
  ["The Hallucinogenic Toreador", "Salvador Dalí", 1970, "Salvador_Dalí_-_The_Hallucinogenic_Toreador.jpg"],
  ["Man at the Crossroads", "Diego Rivera", 1934, "Mural_Diego_Rivera.jpg"],
  ["Dream of a Sunday Afternoon in Alameda Park", "Diego Rivera", 1948, "Sueno_de_una_Tarde_Dominical_en_la_Alameda_Central-Dream_of_a_Sunday_Afternoon_in_Alameda_Park.jpg"],
  ["The Flower Carrier", "Diego Rivera", 1935, "Diego_Rivera_-_El_cargador_de_flores.jpg"],
  ["Echo of a Scream", "David Alfaro Siqueiros", 1937, "Echo_of_a_Scream.jpg"],
  ["Migration of the Negro Panel 1", "Jacob Lawrence", 1941, "Jacob_Lawrence_-_Migration_Series.jpg"],
  ["Number 1 (Lavender Mist)", "Jackson Pollock", 1950, "Number_1A,_1948_(Pollock).jpg"],
  ["Composition with Large Red Plane", "Piet Mondrian", 1921, "Piet_Mondriaan,_1921_-_Composition_en_rouge,_jaune,_bleu_et_noir.jpg"],
  ["Victory Boogie Woogie", "Piet Mondrian", 1944, "Mondrian_Victory_Boogie-Woogie.jpg"],
  ["The Red Tree", "Piet Mondrian", 1910, "Piet_Mondrian,_1908-10,_Evening;_Red_Tree_(Avond;_De_rode_boom).jpg"],
  ["Contrast of Forms", "Fernand Léger", 1913, "Fernand_Léger,_1913,_Contraste_de_formes.jpg"],
  ["Three Women", "Fernand Léger", 1921, "Fernand_Léger,_1921,_Le_Grand_Déjeuner_(Three_Women),_oil_on_canvas,_183.5_x_251.5_cm,_Museum_of_Modern_Art,_New_York.jpg"],
  ["Sleeping Muse", "Constantin Brâncuși", 1910, "Constantin_Brancusi,_1910,_Sleeping_Muse.jpg"],
  ["The Reckless Sleeper", "René Magritte", 1928, "Magritte_TheRecklessSleeper.jpg"],
  ["The Listening Room", "René Magritte", 1952, "René_Magritte_The_Listening_Room.jpg"],
  ["The Promenades of Euclid", "René Magritte", 1955, "René_Magritte_The_Promenades_of_Euclid.jpg"],
  ["Not to Be Reproduced", "René Magritte", 1937, "Magritte_Not_to_be_Reproduced.jpg"],
  ["The Key of Dreams", "René Magritte", 1930, "Magritte_TheKeyOfDreams.jpg"],
  ["The Blank Signature", "René Magritte", 1965, "René_Magritte_The_Blank_Signature.jpg"],
  ["The Castle of the Pyrenees", "René Magritte", 1959, "Magritte_CastlePyrenees.jpg"],
  ["Relativity", "M.C. Escher", 1953, "Escher's_Relativity.jpg"],
  ["Hand with Reflecting Sphere", "M.C. Escher", 1935, "Hand_with_Reflecting_Sphere.jpg"],
  ["Waterfall", "M.C. Escher", 1961, "Escher_Waterfall.jpg"],
  ["Drawing Hands", "M.C. Escher", 1948, "DrawingHands.jpg"],
  ["Ascending and Descending", "M.C. Escher", 1960, "Ascending_and_Descending.jpg"],
  ["Day and Night", "M.C. Escher", 1938, "Escher_Day_and_Night.jpg"],

  // =========================================================================
  // ADDITIONAL COLOR FIELD & MINIMALISM
  // =========================================================================
  ["Who's Afraid of Red Yellow Blue III", "Barnett Newman", 1967, "Barnett_Newman_Who's_Afraid_of_Red,_Yellow_and_Blue_III.jpg"],
  ["Untitled (Orange, Red, Yellow)", "Mark Rothko", 1961, "Rothko-orange-red-yellow.jpg"],
  ["Green on Blue", "Mark Rothko", 1956, "Mark_Rothko_-_Green_on_Blue.jpg"],
  ["Campbell's Soup Can (Tomato)", "Andy Warhol", 1962, "Warhol-Campbell_Soup-1-screenprint-1968.jpg"],
  ["Gold Marilyn Monroe", "Andy Warhol", 1962, "Warhol_Gold_Marilyn.jpg"],
  ["Green Coca-Cola Bottles", "Andy Warhol", 1962, "Warhol-Green_Coca-Cola_Bottles.jpg"],
  ["Eight Elvises", "Andy Warhol", 1963, "Warhol-Eight_Elvises.jpg"],
  ["Red Blue Green", "Ellsworth Kelly", 1963, "Ellsworth_Kelly_-_Red_Blue_Green.jpg"],
  ["Black in Deep Red", "Mark Rothko", 1957, "Mark_Rothko_-_Black_in_Deep_Red.jpg"],

  // =========================================================================
  // ADDITIONAL IMPRESSIONISM & LANDSCAPE
  // =========================================================================
  ["Water Lilies (Green Reflections)", "Claude Monet", 1920, "Claude_Monet_-_Water_Lilies_(Agapanthus)_-_Google_Art_Project.jpg"],
  ["Impression III (Concert)", "Wassily Kandinsky", 1911, "Vassily_Kandinsky,_1911_-_Impression_III_(Concert).jpg"],
  ["The Blue Rigi", "J.M.W. Turner", 1842, "Joseph_Mallord_William_Turner_-_The_Blue_Rigi,_Sunrise_-_Google_Art_Project.jpg"],
  ["Venice from the Porch of Madonna della Salute", "J.M.W. Turner", 1835, "Venice,_from_the_Porch_of_Madonna_della_Salute_JMW_Turner.jpg"],
  ["The Grand Canal Venice", "J.M.W. Turner", 1835, "Joseph_Mallord_William_Turner_-_The_Grand_Canal_-_Venice_-_Google_Art_Project.jpg"],
  ["Norham Castle Sunrise", "J.M.W. Turner", 1845, "Joseph_Mallord_William_Turner_-_Norham_Castle,_Sunrise_-_WGA23182.jpg"],
  ["The Lake of Zug", "J.M.W. Turner", 1843, "Joseph_Mallord_William_Turner_-_The_Lake_of_Zug.jpg"],
  ["The Starry Night", "Vincent van Gogh", 1889, "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg"],
  ["The Bedroom", "Vincent van Gogh", 1889, "Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg"],
  ["Pine Forest", "Ivan Shishkin", 1889, "Ivan_Shishkin_-_Morning_in_a_Pine_Forest_-_Google_Art_Project.jpg"],
  ["Rooks Have Come", "Alexei Savrasov", 1871, "Alexei_Savrasov_-_The_Rooks_Have_Come_Back_-_Google_Art_Project.jpg"],
  ["The Ninth Wave", "Ivan Aivazovsky", 1850, "Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg"],
  ["Reply of the Zaporozhian Cossacks", "Ilya Repin", 1891, "Ilya_Repin_-_Reply_of_the_Zaporozhian_Cossacks_-_Yorck.jpg"],
  ["Barge Haulers on the Volga", "Ilya Repin", 1873, "Ilia_Efimovich_Repin_(1844-1930)_-_Volga_Boatmen_(1870-1873).jpg"],
  ["Ivan the Terrible and His Son", "Ilya Repin", 1885, "REPIN_Ivan_Terrible&Ivan.jpg"],
  ["Demon Seated", "Mikhail Vrubel", 1890, "Mikhail_Vrubel_-_Demon_Seated.jpg"],
  ["The Black Square", "Kazimir Malevich", 1913, "Malevich.black-square.jpg"],

  // =========================================================================
  // ADDITIONAL SYMBOLISM & DECORATIVE
  // =========================================================================
  ["Water Serpents II", "Gustav Klimt", 1907, "Gustav_Klimt_013.jpg"],
  ["Nuda Veritas", "Gustav Klimt", 1899, "Gustav_Klimt_-_Nuda_Veritas_-_Google_Art_Project.jpg"],
  ["The Beethoven Frieze", "Gustav Klimt", 1902, "Klimt_-_Beethovenfries.jpg"],
  ["Hygieia", "Gustav Klimt", 1907, "Gustav_Klimt_-_Hygieia_(Medizin)_-_Google_Art_Project.jpg"],
  ["Portrait of Emilie Flöge", "Gustav Klimt", 1902, "Gustav_Klimt_-_Emilie_Flöge.jpg"],
  ["The Virgin", "Gustav Klimt", 1913, "Gustav_Klimt_-_Die_Jungfrau_(The_Virgin)_-_Google_Art_Project.jpg"],
  ["Garden Path with Chickens", "Gustav Klimt", 1916, "Gustav_Klimt_-_Gartenweg_mit_Hühnern.jpg"],
  ["Pallas Athene", "Gustav Klimt", 1898, "Gustav_Klimt_-_Pallas_Athene.jpg"],
  ["The Hostile Powers", "Gustav Klimt", 1902, "Klimt_Beethoven_Frieze_2.jpg"],
  ["Fulfillment", "Gustav Klimt", 1909, "Gustav_Klimt_-_Stoclet_Frieze_-_Google_Art_Project.jpg"],

  // =========================================================================
  // ADDITIONAL MISC - ROUNDING OUT TO ~1000
  // =========================================================================
  ["The Persistence of Memory", "Salvador Dalí", 1931, "The_Persistence_of_Memory.jpg"],
  ["The Arnolfini Wedding", "Jan van Eyck", 1434, "Van_Eyck_-_Arnolfini_Portrait.jpg"],
  ["Weeping Woman", "Pablo Picasso", 1937, "Pablo_Picasso_-_Femme_en_pleurs.jpg"],
  ["Portrait of Dora Maar", "Pablo Picasso", 1937, "Pablo_Picasso,_1937,_Portrait_de_Dora_Maar.jpg"],
  ["Seated Nude", "Amedeo Modigliani", 1917, "Amedeo_Modigliani_-_Nu_couché.jpg"],
  ["Reclining Nude", "Amedeo Modigliani", 1917, "Amedeo_Modigliani_-_Nu_couché_(1917-18).jpg"],
  ["Portrait of Jeanne Hébuterne", "Amedeo Modigliani", 1919, "Amedeo_Modigliani_-_Portrait_of_Jeanne_Hébuterne.jpg"],
  ["Doe in the Monastery Garden", "Franz Marc", 1912, "Franz_Marc_-_Rehe_im_Walde_II_(Rehe_im_Klostergarten).jpg"],
  ["The Mandrill", "Franz Marc", 1913, "Franz_Marc_-_Mandrill.jpg"],
  ["Red Balloon", "Paul Klee", 1922, "Paul_Klee_Red_Balloon_1922.jpg"],
  ["Highway and Byways", "Paul Klee", 1929, "Paul_Klee_-_Hauptweg_und_Nebenwege.jpg"],
  ["Cat and Bird", "Paul Klee", 1928, "Paul_Klee_Cat_and_Bird_1928.jpg"],
  ["Insula Dulcamara", "Paul Klee", 1938, "Paul_Klee_-_Insula_dulcamara_-_Google_Art_Project.jpg"],
  ["Around the Fish", "Paul Klee", 1926, "Paul_Klee_-_Around_the_Fish_-_MoMA.jpg"],
  ["The Persistence of Memory copy", "Salvador Dalí", 1934, "Salvador_Dalí_Persistence_of_Memory.jpg"],
  ["The Treachery of Images detail", "René Magritte", 1929, "Magritte_pipe.jpg"],
  ["The Great War on Facades", "René Magritte", 1964, "Magritte_GreatWar.jpg"],
  ["Number 1A", "Jackson Pollock", 1948, "Pollock1948.jpg"],
  ["Black and White", "Franz Kline", 1950, "Franz_Kline_Painting_Number_2.jpg"],
  ["Orange Red Yellow", "Mark Rothko", 1961, "Mark_Rothko_-_Orange_Red_Yellow.jpg"],
  ["The Song of Love", "Giorgio de Chirico", 1914, "Giorgio_de_Chirico_-_The_Song_of_Love.jpg"],
  ["Mystery and Melancholy of a Street", "Giorgio de Chirico", 1914, "Giorgio_de_Chirico_-_Mistero_e_malinconia_di_una_strada.jpg"],
  ["The Enigma of Desire", "Salvador Dalí", 1929, "Salvador_Dalí_-_The_Enigma_of_Desire.jpg"],
  ["The Red Room", "Henri Matisse", 1908, "Matisse-The-Red-Room.jpg"],
  ["The Dessert: Harmony in Red", "Henri Matisse", 1908, "Henri_Matisse,_1908,_La_desserte_(Harmonie_en_rouge).jpg"],
  ["Luxe Calme et Volupté", "Henri Matisse", 1904, "Henri_Matisse,_Luxe,_Calme_et_Volupté.jpg"],
  ["Icarus", "Henri Matisse", 1947, "Matisse_-_Icarus.jpg"],
  ["Self-Portrait", "Egon Schiele", 1911, "Egon_Schiele_-_Selbstbildnis_mit_Lampionfrüchten_-_Google_Art_Project.jpg"],
  ["Agony", "Egon Schiele", 1912, "Egon_Schiele_-_Agony_(The_Death_Struggle)_-_Google_Art_Project.jpg"],
  ["The Family", "Egon Schiele", 1918, "Egon_Schiele_-_The_Family_-_Google_Art_Project.jpg"],
  ["Portrait of Wally", "Egon Schiele", 1912, "Egon_Schiele_-_Portrait_of_Wally_Neuzil_-_Google_Art_Project.jpg"],
  ["Crouching Woman with Green Kerchief", "Egon Schiele", 1914, "Egon_Schiele_-_Crouching_Woman_with_Green_Kerchief_-_Google_Art_Project.jpg"],
  ["Black Lines", "Wassily Kandinsky", 1913, "Vassily_Kandinsky,_1913_-_Black_Lines.jpg"],
  ["First Abstract Watercolor", "Wassily Kandinsky", 1910, "Kandinsky_-_Untitled_First_Abstract_Watercolor.jpg"],
  ["Blue Mountain", "Wassily Kandinsky", 1908, "Kandinsky_-_Blue_Mountain.jpg"],
  ["Blue Segment", "Wassily Kandinsky", 1921, "Vassily_Kandinsky,_1921_-_Blue_Segment.jpg"],
  ["Sunday Morning", "Edward Hopper", 1930, "Edward_Hopper_Sunday.jpg"],
  ["Rooms by the Sea", "Edward Hopper", 1951, "Edward_Hopper_-_Rooms_by_the_Sea.jpg"],
  ["House by the Railroad", "Edward Hopper", 1925, "Edward_Hopper_House_by_the_Railroad_1925.jpg"],
  ["Portrait of Dr. Gachet", "Vincent van Gogh", 1890, "Vincent_Willem_van_Gogh_002.jpg"],
  ["The Mulberry Tree", "Vincent van Gogh", 1889, "Van_Gogh_-_The_Mulberry_Tree_-_Google_Art_Project.jpg"],
  ["The Prison Courtyard", "Vincent van Gogh", 1890, "Vincent_van_Gogh_-_The_Prison_Courtyard_(F669).jpg"],
  ["Road with Cypress and Star", "Vincent van Gogh", 1890, "Van_Gogh_-_Country_road_in_Provence_by_night.jpg"],
  ["Still Life: Vase with Twelve Sunflowers", "Vincent van Gogh", 1888, "Vincent_van_Gogh_-_Still_Life_-_Vase_with_Twelve_Sunflowers_-_Google_Art_Project.jpg"],
  ["The Siesta", "Vincent van Gogh", 1890, "Noon,_rest_from_work_-_Van_Gogh.jpg"],
  ["Red Canna", "Georgia O'Keeffe", 1924, "Red_Canna_Georgia_O'Keeffe_1924.jpg"],
  ["Cow's Skull: Red White and Blue", "Georgia O'Keeffe", 1931, "Georgia_O'Keeffe_-_Cow's_Skull-_Red,_White,_and_Blue.jpg"],
  ["Blue and Green Music", "Georgia O'Keeffe", 1921, "Georgia_O'Keeffe_-_Blue_and_Green_Music.jpg"],
  ["Self-Portrait", "Frida Kahlo", 1940, "Frida_Kahlo_-_Self-portrait_1940.jpg"],
  ["The Wounded Deer", "Frida Kahlo", 1946, "Frida_Kahlo_-_The_Wounded_Deer.jpg"],
  ["Memory (The Heart)", "Frida Kahlo", 1937, "Frida_Kahlo_-_Memory_(The_Heart).jpg"],
  ["Self-Portrait on the Borderline", "Frida Kahlo", 1932, "Frida_Kahlo_-_Self-Portrait_on_the_Border_Line_Between_Mexico_and_the_United_States.jpg"],
  ["Green White", "Ellsworth Kelly", 1961, "Ellsworth_Kelly_-_Green_White.jpg"],
  ["Number 7", "Mark Rothko", 1960, "Mark_Rothko_-_No._7_1960.jpg"],
  ["Tiger", "Franz Marc", 1912, "Franz_Marc_-_Tiger.jpg"],
  ["The Yellow Cow", "Franz Marc", 1911, "Franz_Marc_-_The_Yellow_Cow_-_Google_Art_Project.jpg"],
  ["Unique Forms of Continuity in Space", "Umberto Boccioni", 1913, "Unique_Forms_of_Continuity_in_Space.jpg"],
  ["Dynamism of a Dog on a Leash", "Giacomo Balla", 1912, "Giacomo_Balla_-_Dynamism_of_a_Dog_on_a_Leash.jpg"],
  ["Simultaneity", "Giacomo Balla", 1913, "Giacomo_Balla_-_Abstract_Speed_+_Sound.jpg"],
  ["Soft Self-Portrait with Grilled Bacon", "Salvador Dalí", 1941, "Salvador_Dalí_-_Soft_Self-Portrait_with_Grilled_Bacon.jpg"],
  ["The Temptation of Saint Anthony", "Salvador Dalí", 1946, "The_Temptation_of_St._Anthony_(Salvador_Dalí).jpg"],
  ["Metamorphosis of Narcissus", "Salvador Dalí", 1937, "Salvador_Dalí_-_Metamorphosis_of_Narcissus.jpg"],
  ["The Weaning of Furniture Nutrition", "Salvador Dalí", 1934, "Salvador_Dalí_-_Weaning_of_Furniture_Nutrition.jpg"],
  ["Dream Caused by the Flight of a Bee", "Salvador Dalí", 1944, "Salvador_Dalí_-_Dream_Caused_by_the_Flight_of_a_Bee_around_a_Pomegranate_a_Second_Before_Awakening.jpg"],
  ["Cafe Terrace at Night detail", "Vincent van Gogh", 1888, "Vincent_Willem_van_Gogh_-_Cafe_Terrace_at_Night_(Yorck).jpg"],
  ["Self-Portrait Dedicated to Paul Gauguin", "Vincent van Gogh", 1888, "SelbsijgkjPortrait_VG2.jpg"],
  ["The Starry Night sketch", "Vincent van Gogh", 1889, "Van_Gogh_Starry_Night_Drawing.jpg"],

  // =========================================================================
  // ADDITIONAL LANDSCAPE & NATURE MASTERWORKS
  // =========================================================================
  ["The Rocky Mountains", "Albert Bierstadt", 1863, "Albert_Bierstadt_-_The_Rocky_Mountains,_Lander's_Peak.jpg"],
  ["Among the Sierra Nevada", "Albert Bierstadt", 1868, "Albert_Bierstadt_-_Among_the_Sierra_Nevada,_California_-_Google_Art_Project.jpg"],
  ["Niagara", "Frederic Edwin Church", 1857, "Frederic_Edwin_Church_-_Niagara_Falls_-_WGA04867.jpg"],
  ["Twilight in the Wilderness", "Frederic Edwin Church", 1860, "Frederic_Edwin_Church_-_Twilight_in_the_Wilderness_-_Google_Art_Project.jpg"],
  ["Aurora Borealis", "Frederic Edwin Church", 1865, "Frederic_Edwin_Church_-_Aurora_Borealis_-_Google_Art_Project.jpg"],
  ["The Course of Empire - Destruction", "Thomas Cole", 1836, "Cole_Thomas_The_Course_of_Empire_Destruction_1836.jpg"],
  ["The Course of Empire - Desolation", "Thomas Cole", 1836, "Cole_Thomas_The_Course_of_Empire_Desolation_1836.jpg"],
  ["Kindred Spirits", "Asher Brown Durand", 1849, "Asher_Brown_Durand_-_Kindred_Spirits_(Crystal_Bridges_Museum_of_American_Art).jpg"],
  ["The Ship of Fools", "Hieronymus Bosch", 1500, "Jheronimus_Bosch_-_Ship_of_Fools.jpg"],
  ["The Haywain Triptych", "Hieronymus Bosch", 1516, "Jheronimus_Bosch_-_The_Haywain_Triptych.jpg"],
  ["Christ Carrying the Cross", "Hieronymus Bosch", 1510, "Hieronymus_Bosch_-_Christ_Carrying_the_Cross.jpg"],

  // =========================================================================
  // SPANISH OLD MASTERS & ADDITIONAL BAROQUE
  // =========================================================================
  ["The Immaculate Conception", "Bartolomé Esteban Murillo", 1678, "Bartolomé_Esteban_Perez_Murillo_-_Inmaculada_Concepción_de_los_Venerables.jpg"],
  ["Young Beggar", "Bartolomé Esteban Murillo", 1650, "Bartolomé_Esteban_Murillo_-_The_Young_Beggar.jpg"],
  ["Still Life with Lemons", "Francisco de Zurbarán", 1633, "Francisco_de_Zurbarán_-_Still-life_with_Lemons,_Oranges_and_Rose_-_Google_Art_Project.jpg"],
  ["Christ on the Cross", "Francisco de Zurbarán", 1627, "Francisco_de_Zurbarán_-_Christ_on_the_Cross_-_Google_Art_Project.jpg"],
  ["The Kitchen Maid", "Diego Velázquez", 1618, "Diego_Velázquez_-_La_mulata_(National_Gallery_of_Ireland).jpg"],
  ["The Supper at Emmaus", "Diego Velázquez", 1620, "Diego_Velazquez_-_The_Supper_at_Emmaus.jpg"],
  ["The Forge of Vulcan", "Diego Velázquez", 1630, "Diego_Velázquez_-_Apollo_in_the_Forge_of_Vulcan_-_Google_Art_Project.jpg"],
  ["The Toilet of Venus (Rokeby Venus)", "Diego Velázquez", 1650, "Velazquez_-_Rokeby_Venus.jpg"],
  ["Saint Serapion", "Francisco de Zurbarán", 1628, "Francisco_de_Zurbarán_016.jpg"],
  ["Agnus Dei", "Francisco de Zurbarán", 1640, "Francisco_de_Zurbarán_006.jpg"],

  // =========================================================================
  // ADDITIONAL DUTCH & FLEMISH
  // =========================================================================
  ["The Merry Family (Jan Steen)", "Jan Steen", 1668, "Jan_Steen_-_The_Dissolute_Household_-_Google_Art_Project.jpg"],
  ["Girl Eating Oysters", "Jan Steen", 1660, "Jan_Steen_-_Girl_Eating_Oysters.jpg"],
  ["Woman Reading a Letter", "Gerard ter Borch", 1662, "Gerard_ter_Borch_-_Woman_Reading_a_Letter.jpg"],
  ["The Lacemaker (Netscher)", "Caspar Netscher", 1664, "Caspar_Netscher_-_The_Lace_Maker_-_Google_Art_Project.jpg"],
  ["Still Life with a Gilt Cup", "Willem Claesz Heda", 1635, "Willem_Claeszoon_Heda_-_Still_Life_with_a_Gilt_Cup_-_Google_Art_Project.jpg"],
  ["Vanitas Still Life", "Pieter Claesz", 1630, "Pieter_Claesz_-_Vanitas_-_Still_Life.jpg"],
  ["Flower Still Life", "Rachel Ruysch", 1700, "Rachel_Ruysch_-_Flower_Still_Life_-_Google_Art_Project.jpg"],
  ["Vase of Flowers", "Jan Davidsz. de Heem", 1660, "Jan_Davidsz._de_Heem_-_Vase_of_Flowers_-_Google_Art_Project.jpg"],
  ["The Milkmaid (Vermeer detail)", "Johannes Vermeer", 1660, "Vermeer_-_The_Milkmaid.jpg"],
  ["The Allegory of Painting", "Jan Vermeer", 1668, "Jan_Vermeer_-_The_Art_of_Painting.jpg"],

  // =========================================================================
  // ADDITIONAL FRENCH ART (18TH-19TH CENTURY)
  // =========================================================================
  ["The Reader", "Jean-Honoré Fragonard", 1770, "Jean-Honoré_Fragonard_-_A_Young_Girl_Reading_-_Google_Art_Project.jpg"],
  ["The Bolt", "Jean-Honoré Fragonard", 1778, "Jean-Honoré_Fragonard_-_Le_Verrou.jpg"],
  ["The Music Lesson", "Jean-Honoré Fragonard", 1769, "Jean-Honoré_Fragonard_-_The_Music_Lesson_-_Google_Art_Project.jpg"],
  ["Diana Resting after her Bath", "François Boucher", 1742, "François_Boucher_-_Diana_Leaving_Her_Bath_-_Google_Art_Project.jpg"],
  ["Madame de Pompadour", "François Boucher", 1756, "François_Boucher_-_Madame_de_Pompadour_-_Google_Art_Project.jpg"],
  ["The Luncheon", "François Boucher", 1739, "François_Boucher_-_Le_Déjeuner_-_Google_Art_Project.jpg"],
  ["The Return from Market", "Jean-Baptiste-Siméon Chardin", 1739, "Chardin_-_Le_retour_de_marché.jpg"],
  ["The Young Schoolmistress", "Jean-Baptiste-Siméon Chardin", 1740, "Jean-Baptiste-Siméon_Chardin_-_The_Young_Schoolmistress_-_Google_Art_Project.jpg"],
  ["Boy Blowing Bubbles", "Jean-Baptiste-Siméon Chardin", 1734, "Jean-Baptiste-Siméon_Chardin_007.jpg"],
  ["The Skate", "Jean-Baptiste-Siméon Chardin", 1728, "Jean-Baptiste-Siméon_Chardin_-_The_Ray_-_WGA04741.jpg"],
  ["The Intervention of the Sabine Women", "Jacques-Louis David", 1799, "Jacques-Louis_David_-_The_Intervention_of_the_Sabine_Women_-_Google_Art_Project.jpg"],
  ["Death of Socrates", "Jacques-Louis David", 1787, "David_-_The_Death_of_Socrates.jpg"],
  ["The Lictors Bring to Brutus the Bodies of His Sons", "Jacques-Louis David", 1789, "David-Brutus.jpg"],

  // =========================================================================
  // MORE BRITISH ART
  // =========================================================================
  ["The Rokeby Venus detail", "Diego Velázquez", 1651, "Velázquez_-_The_Toilet_of_Venus_('The_Rokeby_Venus').jpg"],
  ["The Cornfield", "John Constable", 1826, "John_Constable_The_Cornfield.jpg"],
  ["Flatford Mill", "John Constable", 1817, "John_Constable_-_Flatford_Mill_-_Google_Art_Project.jpg"],
  ["Dedham Vale", "John Constable", 1802, "John_Constable_-_Dedham_Vale_-_Google_Art_Project.jpg"],
  ["Norham Castle", "J.M.W. Turner", 1798, "J._M._W._Turner_-_Norham_Castle.jpg"],
  ["The Shipwreck", "J.M.W. Turner", 1805, "Joseph_Mallord_William_Turner_-_The_Shipwreck_-_Google_Art_Project.jpg"],
  ["Peace - Burial at Sea", "J.M.W. Turner", 1842, "Turner_-_Peace_Burial_at_Sea.jpg"],
  ["Ulysses Deriding Polyphemus", "J.M.W. Turner", 1829, "Joseph_Mallord_William_Turner_-_Ulysses_Deriding_Polyphemus_-_Google_Art_Project.jpg"],
  ["Mariana", "John Everett Millais", 1851, "John_Everett_Millais_-_Mariana_-_Google_Art_Project.jpg"],
  ["The Order of Release", "John Everett Millais", 1853, "John_Everett_Millais_-_The_Order_of_Release,_1746_-_Google_Art_Project.jpg"],
  ["The Soul of the Rose", "John William Waterhouse", 1908, "John_William_Waterhouse_-_The_Soul_of_the_Rose.jpg"],
  ["Boreas", "John William Waterhouse", 1903, "John_William_Waterhouse_-_Boreas.jpg"],
  ["The Crystal Ball", "John William Waterhouse", 1902, "John_William_Waterhouse_-_The_Crystal_Ball.JPG"],
  ["Miranda", "John William Waterhouse", 1916, "John_William_Waterhouse_-_Miranda_-_The_Tempest.jpg"],
  ["Windflowers", "John William Waterhouse", 1903, "John_William_Waterhouse_-_Windflowers.jpg"],
  ["The Favourites of the Emperor Honorius", "John William Waterhouse", 1883, "John_William_Waterhouse_-_The_Favorites_of_the_Emperor_Honorius_-_1883.jpg"],

  // =========================================================================
  // MORE IMPRESSIONISM & NEO-IMPRESSIONISM
  // =========================================================================
  ["The Seine at Chatou", "Pierre-Auguste Renoir", 1881, "Pierre-Auguste_Renoir_-_The_Seine_at_Chatou_-_Google_Art_Project.jpg"],
  ["Girls at the Piano", "Pierre-Auguste Renoir", 1892, "Pierre-Auguste_Renoir_-_Jeunes_filles_au_piano.jpg"],
  ["The Promenade", "Pierre-Auguste Renoir", 1870, "Pierre-Auguste_Renoir_-_La_Promenade.jpg"],
  ["Madame Charpentier and Her Children", "Pierre-Auguste Renoir", 1878, "Pierre-Auguste_Renoir_-_Madame_Georges_Charpentier_et_ses_enfants.jpg"],
  ["The Rowers Lunch", "Pierre-Auguste Renoir", 1880, "Pierre-Auguste_Renoir_-_Le_déjeuner_des_canotiers.jpg"],
  ["Four Dancers", "Edgar Degas", 1899, "Edgar_Degas_-_Four_Dancers_-_Google_Art_Project.jpg"],
  ["Dancers at the Barre", "Edgar Degas", 1900, "Edgar_Degas_-_Dancers_at_the_Barre.jpg"],
  ["Miss La La at the Cirque Fernando", "Edgar Degas", 1879, "Edgar_Degas_Miss_La_La_at_the_Cirque_Fernando.jpg"],
  ["The Cotton Exchange", "Edgar Degas", 1873, "Edgar_Degas_-_A_Cotton_Office_in_New_Orleans_-_Google_Art_Project.jpg"],
  ["Woman Ironing", "Edgar Degas", 1886, "Edgar_Degas_-_Woman_Ironing_-_Google_Art_Project.jpg"],
  ["The Japanese Bridge (later)", "Claude Monet", 1920, "Claude_Monet_-_The_Japanese_Footbridge.jpg"],
  ["Waterloo Bridge", "Claude Monet", 1903, "Claude_Monet_-_Waterloo_Bridge,_London,_at_Dusk.jpg"],
  ["The Beach at Trouville", "Claude Monet", 1870, "Claude_Monet_-_The_Beach_at_Trouville.jpg"],
  ["Autumn Effect at Argenteuil", "Claude Monet", 1873, "Claude_Monet_-_Autumn_Effect_at_Argenteuil.jpg"],
  ["La Japonaise", "Claude Monet", 1876, "Claude_Monet_-_La_Japonaise_-_Google_Art_Project.jpg"],
  ["Charing Cross Bridge", "Claude Monet", 1901, "Claude_Monet_-_Charing_Cross_Bridge_-_Google_Art_Project.jpg"],
  ["The Railway", "Édouard Manet", 1873, "Edouard_Manet_-_The_Railway_-_Google_Art_Project.jpg"],
  ["Boating", "Édouard Manet", 1874, "Edouard_Manet_-_Boating_-_Google_Art_Project.jpg"],
  ["The Spanish Singer", "Édouard Manet", 1860, "Edouard_Manet_-_The_Spanish_Singer_-_Google_Art_Project.jpg"],
  ["Portrait of Émile Zola", "Édouard Manet", 1868, "Edouard_Manet_-_Emile_Zola_-_Google_Art_Project.jpg"],

  // =========================================================================
  // MORE RUSSIAN & EASTERN EUROPEAN ART
  // =========================================================================
  ["The Appearance of Christ Before the People", "Alexander Ivanov", 1857, "Alexander_Andreyevich_Ivanov_-_The_Appearance_of_Christ_Before_the_People_-_Google_Art_Project.jpg"],
  ["Demon Downcast", "Mikhail Vrubel", 1902, "Vrubel_Demon.jpg"],
  ["The Princess of the Dream", "Mikhail Vrubel", 1896, "Mikhail_Vrubel_-_The_Swan_Princess.jpg"],
  ["Unknown Woman", "Ivan Kramskoi", 1883, "Kramskoi_-_Неизвестная.jpg"],
  ["They Did Not Expect Him", "Ilya Repin", 1884, "Ilya_Repin_-_They_Did_Not_Expect_Him_-_Google_Art_Project.jpg"],
  ["Morning in a Pine Forest", "Ivan Shishkin", 1889, "Utro_v_sosnovom_lesu.jpg"],
  ["The Rooks Have Returned", "Alexei Savrasov", 1871, "Savrasov_Grachi.jpg"],
  ["The Apotheosis of War", "Vasily Vereshchagin", 1871, "Vereschagin." ],
  ["Moonlit Night on the Dnieper", "Arkhip Kuindzhi", 1880, "Kuindzhi_Moonlit_night_on_the_Dnieper_1880.jpg"],
  ["Girl with Peaches", "Valentin Serov", 1887, "Valentin_Serov_-_Girl_with_Peaches.jpg"],
  ["Princess Tarakanova", "Konstantin Flavitsky", 1864, "Flavitsky_-_Princess_Tarakanova.jpg"],

  // =========================================================================
  // ADDITIONAL ABSTRACT & MODERN
  // =========================================================================
  ["Suprematist Composition: White on White", "Kazimir Malevich", 1918, "Kazimir_Malevich_-_Suprematist_Composition_-_White_on_White.jpg"],
  ["Red Square", "Kazimir Malevich", 1915, "Malevich_red_square.jpg"],
  ["Dynamic Suprematism", "Kazimir Malevich", 1916, "Kazimir_Malevich_-_Dynamic_Suprematism.jpg"],
  ["Counter-Composition V", "Theo van Doesburg", 1924, "Theo_van_Doesburg_Counter-Composition_V_(1924).jpg"],
  ["Arithmetic Composition", "Theo van Doesburg", 1930, "Theo_van_Doesburg_-_Arithmetic_Composition.jpg"],
  ["Color Study: Squares with Concentric Circles", "Wassily Kandinsky", 1913, "Vassily_Kandinsky,_1913_-_Color_Study,_Squares_with_Concentric_Circles.jpg"],
  ["Small Worlds I", "Wassily Kandinsky", 1922, "Kandinsky_-_Small_Worlds_I.jpg"],
  ["Transverse Line", "Wassily Kandinsky", 1923, "Vassily_Kandinsky,_1923_-_Transverse_Line.jpg"],
  ["Upward", "Wassily Kandinsky", 1929, "Kandinsky_-_Upward.jpg"],
  ["Dominant Curve", "Wassily Kandinsky", 1936, "Vassily_Kandinsky_-_Dominant_Curve.jpg"],
  ["Les Demoiselles d'Avignon detail", "Pablo Picasso", 1907, "Pablo_Picasso,_1907,_Les_Demoiselles_d'Avignon.jpg"],
  ["Portrait of Daniel-Henry Kahnweiler", "Pablo Picasso", 1910, "Pablo_Picasso,_1910,_Portrait_of_Daniel-Henry_Kahnweiler,_oil_on_canvas,_101.1_x_73.6_cm,_Art_Institute_of_Chicago.jpg"],
  ["Mandolin and Guitar", "Pablo Picasso", 1924, "Pablo_Picasso,_1924,_Mandoline_et_guitare.jpg"],
  ["The Old Man Guitar Player", "Pablo Picasso", 1903, "Pablo_Picasso_-_The_Blind_Man's_Meal_-_Google_Art_Project.jpg"],
  ["Harlequin", "Pablo Picasso", 1915, "Pablo_Picasso,_1915,_Harlequin,_oil_on_canvas,_183.5_x_105.1_cm,_Museum_of_Modern_Art.jpg"],
  ["Woman in White", "Pablo Picasso", 1923, "Pablo_Picasso,_1923,_Woman_in_White.jpg"],
  ["Seated Harlequin", "Pablo Picasso", 1901, "Pablo_Picasso,_1901,_Harlequin.jpg"],

  // =========================================================================
  // ADDITIONAL CONTEMPORARY & DIVERSE
  // =========================================================================
  ["The Physical Impossibility of Death", "Damien Hirst", 1991, "Hirst-Shark.jpg"],
  ["My Bed", "Tracey Emin", 1998, "Tracey_Emin_My_Bed_1998.jpg"],
  ["Equivalent VIII", "Carl Andre", 1966, "Carl_Andre_-_Equivalent_VIII.jpg"],
  ["Marilyn Monroe (Gold)", "Andy Warhol", 1962, "Andy_Warhol_-_Marilyn_Monroe.jpg"],
  ["Disaster Series", "Andy Warhol", 1963, "Andy_Warhol_Silver_Car_Crash.jpg"],
  ["Brillo Boxes", "Andy Warhol", 1964, "Warhol-Brillo-Box.jpg"],
  ["In the Car", "Roy Lichtenstein", 1963, "Roy_Lichtenstein_In_the_Car.jpg"],
  ["Hopeless", "Roy Lichtenstein", 1963, "Roy_Lichtenstein_Hopeless.jpg"],
  ["Oh Jeff", "Roy Lichtenstein", 1964, "Roy_Lichtenstein_-_Oh,_Jeff.jpg"],
  ["Girl with Hair Ribbon", "Roy Lichtenstein", 1965, "Roy_Lichtenstein_-_Girl_with_Hair_Ribbon.jpg"],
  ["Untitled (Skull)", "Jean-Michel Basquiat", 1981, "Jean-Michel_Basquiat_Untitled_1982.jpg"],
  ["Walking Man I", "Alberto Giacometti", 1961, "Alberto_Giacometti_-_L'Homme_qui_marche.jpg"],
  ["Espace Bleu", "Yves Klein", 1960, "IKB_191.jpg"],
  ["Cut with the Kitchen Knife", "Hannah Höch", 1920, "Hannah_Höch,_Cut_with_the_Kitchen_Knife_Dada_Through_the_Last_Weimar_Beer-Belly_Cultural_Epoch_of_Germany.jpg"],
  ["LHOOQ", "Marcel Duchamp", 1919, "Marcel_Duchamp,_1919,_L.H.O.O.Q.jpg"],
  ["The Dinner Party", "Judy Chicago", 1979, "The_Dinner_Party_Judy_Chicago.jpg"],
  ["Untitled Film Still #21", "Cindy Sherman", 1978, "Cindy_Sherman_Untitled_Film_Still_21.jpg"],
  ["Spiral Jetty", "Robert Smithson", 1970, "Spiral-jetty-from-rozel-point.png"],
  ["No. 5 (1962)", "Mark Rothko", 1962, "Mark_Rothko_-_No._5-No._22.jpg"],
  ["Painting (1948)", "Willem de Kooning", 1948, "Willem_de_Kooning_-_Painting.jpg"],
  ["Ab Expressionist Untitled", "Franz Kline", 1952, "Franz_Kline_-_Painting_No._7.jpg"],
  ["Untitled (Violet Black Orange)", "Mark Rothko", 1953, "Mark_Rothko_-_Untitled_(Violet,_Black,_Orange,_Yellow_on_White_and_Red).jpg"],

  // =========================================================================
  // ADDITIONAL MISC MASTERWORKS
  // =========================================================================
  ["Vertumnus", "Giuseppe Arcimboldo", 1591, "Vertumnus_årstidernas_gud_målad_av_Giuseppe_Arcimboldo_1591_-_Skoklosters_slott_-_91503.tif.jpg"],
  ["The Four Seasons (Summer)", "Giuseppe Arcimboldo", 1573, "Giuseppe_Arcimboldo_-_Summer_-_Google_Art_Project.jpg"],
  ["The Librarian", "Giuseppe Arcimboldo", 1566, "Giuseppe_Arcimboldo_-_The_Librarian_-_Google_Art_Project.jpg"],
  ["Lady with a Fan", "Gustav Klimt", 1918, "Gustav_Klimt_-_Lady_with_Fan.jpg"],
  ["Flower Garden", "Gustav Klimt", 1906, "Gustav_Klimt_-_Bauerngarten_(Blumengarten)_-_4993_-_Österreichische_Galerie_Belvedere.jpg"],
  ["Avenue in the Park of Schloss Kammer", "Gustav Klimt", 1912, "Gustav_Klimt_-_Avenue_in_Schloss_Kammer_Park_-_Google_Art_Project.jpg"],
  ["Church in Cassone", "Gustav Klimt", 1913, "Gustav_Klimt_-_Church_in_Cassone.jpg"],
  ["Leda", "Gustav Klimt", 1917, "Gustav_Klimt_-_Leda.jpg"],
  ["The Arnolfini Portrait (detail hands)", "Jan van Eyck", 1434, "Jan_van_Eyck_001.jpg"],
  ["The Madonna of Chancellor Rolin", "Jan van Eyck", 1435, "Jan_van_Eyck_-_The_Virgin_of_Chancellor_Rolin_-_Google_Art_Project.jpg"],
  ["The Concert of Angels", "Matthias Grünewald", 1515, "Grunewald_Isenheim2.jpg"],
  ["The Resurrection", "Matthias Grünewald", 1515, "Grunewald_Isenheim_Resurrection.jpg"],
  ["Landscape with the Flight into Egypt", "Joachim Patinir", 1520, "Joachim_Patinir_-_Landscape_with_the_Flight_into_Egypt_-_Google_Art_Project.jpg"],
  ["The Triumph of Bacchus (Los Borrachos)", "Diego Velázquez", 1629, "Velazquez-The_Triumph_of_Bacchus.jpg"],
  ["Philip IV in Brown and Silver", "Diego Velázquez", 1632, "Diego_Velázquez_-_Philip_IV_in_Brown_and_Silver_-_Google_Art_Project.jpg"],
  ["Equestrian Portrait of the Duke of Lerma", "Peter Paul Rubens", 1603, "Peter_Paul_Rubens_-_Equestrian_Portrait_of_the_Duke_of_Lerma_-_Google_Art_Project.jpg"],
  ["The Education of the Princess", "Peter Paul Rubens", 1625, "Peter_Paul_Rubens_-_Education_of_the_Princess_-_WGA20338.jpg"],
  ["Head of Medusa", "Peter Paul Rubens", 1618, "Peter_Paul_Rubens_-_Head_of_Medusa_-_Google_Art_Project.jpg"],
  ["Prometheus Bound", "Peter Paul Rubens", 1618, "Peter_Paul_Rubens_-_Prometheus_Bound.jpg"],
  ["The Concert", "Gerard van Honthorst", 1623, "Gerard_van_Honthorst_-_The_Concert_-_Google_Art_Project.jpg"],
  ["The Matchmaker", "Gerard van Honthorst", 1625, "Gerard_van_Honthorst_-_The_Matchmaker.jpg"],
  ["Georges de La Tour - The Penitent Magdalen", "Georges de La Tour", 1640, "Georges_de_La_Tour_-_The_Penitent_Magdalen_-_Google_Art_Project.jpg"],
  ["The Cheat with the Ace of Diamonds", "Georges de La Tour", 1635, "Georges_de_La_Tour_-_The_Cheat_with_the_Ace_of_Diamonds_-_Google_Art_Project.jpg"],
  ["Newborn", "Georges de La Tour", 1648, "Georges_de_La_Tour_-_Newborn_-_Google_Art_Project.jpg"],
  ["Girl Arranging Her Hair", "Mary Cassatt", 1886, "Mary_Cassatt_-_Girl_Arranging_Her_Hair_-_Google_Art_Project.jpg"],
  ["The Child's Bath", "Mary Cassatt", 1893, "Mary_Cassatt_-_The_Child's_Bath_-_Google_Art_Project.jpg"],
  ["Little Girl in a Blue Armchair", "Mary Cassatt", 1878, "Mary_Cassatt_-_Little_Girl_in_a_Blue_Armchair_-_Google_Art_Project.jpg"],
  ["In the Loge", "Mary Cassatt", 1878, "Mary_Stevenson_Cassatt_-_In_the_Loge_-_Google_Art_Project.jpg"],
  ["The Letter", "Mary Cassatt", 1891, "Mary_Cassatt_-_The_Letter_-_Google_Art_Project.jpg"],
  ["Summer's Day", "Berthe Morisot", 1879, "Berthe_Morisot_-_Summer's_Day_-_Google_Art_Project.jpg"],
  ["Woman at Her Toilette", "Berthe Morisot", 1875, "Berthe_Morisot_-_At_the_Psyche.jpg"],
  ["After Dinner at Ornans", "Gustave Courbet", 1849, "Gustave_Courbet_-_After_Dinner_at_Ornans_-_Google_Art_Project.jpg"],
  ["Bonjour Monsieur Courbet", "Gustave Courbet", 1854, "Gustave_Courbet_-_Bonjour,_Monsieur_Courbet_-_Musée_Fabre.jpg"],
  ["The Source", "Gustave Courbet", 1868, "Gustave_Courbet_-_La_Source_(Musée_d'Orsay).jpg"],
  ["Olympia (detail)", "Édouard Manet", 1863, "Edouard_Manet_-_Olympia_-_Google_Art_Project.jpg"],
  ["The Execution of Emperor Maximilian", "Édouard Manet", 1868, "Edouard_Manet_-_The_Execution_of_Emperor_Maximilian.jpg"],
  ["In the Conservatory", "Édouard Manet", 1879, "Edouard_Manet_-_In_the_Conservatory_-_Google_Art_Project.jpg"],
  ["Le Repos", "Édouard Manet", 1871, "Edouard_Manet_-_Repose_-_Google_Art_Project.jpg"],
  ["The Dead Christ with Angels", "Édouard Manet", 1864, "Edouard_Manet_-_The_Dead_Christ_with_Angels_-_Google_Art_Project.jpg"],
  ["Dance in the Country", "Pierre-Auguste Renoir", 1883, "Pierre-Auguste_Renoir_-_Country_Dance_-_Google_Art_Project.jpg"],
  ["Dance in the City", "Pierre-Auguste Renoir", 1883, "Pierre-Auguste_Renoir_-_Dance_in_the_City_-_Google_Art_Project.jpg"],
  ["Portrait of Irène Cahen d'Anvers", "Pierre-Auguste Renoir", 1880, "Pierre-Auguste_Renoir_-_Irène_Cahen_d'Anvers_(La_petite_Irène).jpg"],
];

// ============================================================================
// GENERATE REFERENCE DATA
// ============================================================================

// Deduplicate by commons filename
const seen = new Set();
const uniquePaintings = [];
for (const p of paintings) {
  const key = p[3]; // commons filename
  if (!seen.has(key)) {
    seen.add(key);
    uniquePaintings.push(p);
  }
}

console.log(`Total paintings: ${paintings.length}`);
console.log(`Unique (by filename): ${uniquePaintings.length}`);

// Generate reference URLs
const referenceUrls = uniquePaintings.map(([title, artist, year, commonsFile]) => {
  const slug = slugify(title, artist);
  const url = commonsUrl(commonsFile, 800);
  return {
    name: slug,
    title: title,
    artist: artist,
    year: year,
    url: url,
  };
});

// Write output
const outDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, "art-references.json");
fs.writeFileSync(outPath, JSON.stringify(referenceUrls, null, 2));
console.log(`Wrote ${referenceUrls.length} entries to ${outPath}`);

// Also write a minimal version (just name + url) for paintingwide.js compatibility
const minimal = referenceUrls.map(({ name, url }) => ({ name, url }));
const minPath = path.join(outDir, "art-references-minimal.json");
fs.writeFileSync(minPath, JSON.stringify(minimal, null, 2));
console.log(`Wrote minimal version to ${minPath}`);
