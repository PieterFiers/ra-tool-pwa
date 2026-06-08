// RA Tool v2 — data.js
// ISO 12100 Annex B — Complete gevarencatalogus
const GEVAREN_DATA = {
  "Mechanische Gevaren": {
    oorzaken: [
      "Versnellen/vertragen","puntige delen","bewegend deel nadert stilstaand deel",
      "snijdende delen","elastische delen","vallende voorwerpen","zwaartekracht",
      "hoogte boven grondvlak (valgevaar)","hoge druk","instabiliteit","kinetische energie",
      "mobiliteit van de machine","bewegende delen","roterende delen","ruw, glad oppervlak",
      "scherpe randen","potentiële energie","Vacuüm"
    ],
    gevolgen: [
      "overreden worden","weggeslingerd worden","bekneld raken","snijden of afsnijden",
      "naar binnen getrokken worden of opsluiting","vastraken","zich wrijven en schaven",
      "stoten","injectie","afknippen","uitglijden, struikelen en vallen","steken of doorboren",
      "verstikking","Knelling, kneuzing","breuk van grote botten","verbrijzeling","dood"
    ]
  },
  "Elektrische gevaren": {
    oorzaken: [
      "Vlamboog","elektromagnetische verschijnselen","elektrostatische verschijnselen",
      "onder spanning staande delen","Onvoldoende afstand tot hoogspanning staande delen",
      "overbelasting","delen die door een defect onder spanning staan","kortsluiting","thermische straling"
    ],
    gevolgen: [
      "verbranding","chemische reacties","gevolgen voor medische implantaten","elektrocutie",
      "vallen, weggeslingerd worden","brand","wegvliegen van gesmolten deeltjes","elektrische schok"
    ]
  },
  "Thermische gevaren": {
    oorzaken: [
      "Explosie","Vlammen","Voorwerpen of materialen met hoge temperatuur",
      "Voorwerpen of materialen met lage temperatuur","straling van warmtebronnen"
    ],
    gevolgen: [
      "verbranding","uitdroging","onbehagen","bevriezing","letsel door straling van warmtebronnen","blaarvorming"
    ]
  },
  "Gevaren door geluid": {
    oorzaken: [
      "Cavitatieverschijnselen","uitlaatsysteem","gaslekkage met hoge snelheid",
      "fabricageproces (stansen/snijden/frezen)","bewegende delen","schrapende oppervlakken",
      "in onbalans roterende delen","sissende pneumatiek","versleten delen"
    ],
    gevolgen: [
      "Onbehagen","bewusteloosheid","evenwichtstoornis","blijvend gehoorverlies",
      "psychische spanningen","oorsuizing","vermoeidheid","andere gevolgen"
    ]
  },
  "Gevaren door trilling": {
    oorzaken: [
      "Cavitatieverschijnselen","foutieve uitlijning bewegende delen","mobiele uitrusting",
      "schrapende oppervlakken","in onbalans roterende delen","trillende uitrusting","versleten delen"
    ],
    gevolgen: [
      "onbehagen","lage rugpijn","neurologische aandoening","gewrichtsaandoeningen",
      "aandoening aan de wervelkolom","vaatziekten"
    ]
  },
  "Gevaren door straling": {
    oorzaken: [
      "ioniserende straling","laagfrequente elektromagnetische straling",
      "optische straling (infrarood/ultraviolet/laser)","hoogfrequente straling"
    ],
    gevolgen: [
      "verbranding","schade aan ogen en huid","gevolgen voor de voortplanting","mutaties","hoofdpijn/slapeloosheid"
    ]
  },
  "Gevaren door materialen en stoffen": {
    oorzaken: [
      "Aerosol","biologische en microbiologische stoffen","brandbare stoffen","stof",
      "explosieve stoffen","vezels","ontvlambare stoffen/materialen","vloeistof",
      "Rook","Gas","Nevel of Damp","Oxiderende stoffen"
    ],
    gevolgen: [
      "Ademhalingsproblemen / verstikking","kanker","corrosie","gevolgen voor de voortplanting",
      "explosie","brand","infecties","mutaties","vergiftiging","overgevoeligheid"
    ]
  },
  "Ergonomische gevaren": {
    oorzaken: [
      "Toegang","Ontwerp of plaatsing visuele aanduiding en beeldschermen",
      "Ontwerp, plaatsing of aanduiding van bedieningsorganen","inspanning",
      "flikkering, verblinding, schaduwwerking, stroboscopische effecten",
      "plaatselijke verlichting","mentale over/onderbelasting","lichaamshouding",
      "zich herhalende activiteiten","zichtbaarheid"
    ],
    gevolgen: [
      "onbehagen","vermoeidheid","aandoening aan spieren en geraamte",
      "psychische spanningen","gevolgen van menselijke fouten (mechanisch/elektrisch)"
    ]
  },
  "Gevaren uit de omgeving": {
    oorzaken: [
      "Stof en nevel/damp","elektromagnetische storingen","blikseminslag","vocht",
      "verontreiniging","sneeuw en ijs","temperatuurextremenen","water","wind","zuurstofgebrek"
    ],
    gevolgen: ["verbranding","lichte aandoeningen","uitglijden/vallen","verstikking"]
  },
  "Combinatie van gevaren": {
    oorzaken: [
      "Zich herhalende activiteiten + inspanning + hoge temperatuur",
      "Chemische blootstelling + warmte","Mechanisch + ergonomisch",
      "Combinatie naar eigen omschrijving"
    ],
    gevolgen: [
      "uitdroging","onoplettendheid","hitteberoerte","meervoudig letsel","cumulatief letsel"
    ]
  }
};

// Gebruiksfasen ISO 12100
const GEBRUIKSFASEN = [
  "Transport / inbedrijfstelling",
  "Normaal bedrijf",
  "Instellen / omstellen",
  "Onderhoud / reiniging",
  "Stilstand / energieisolatie",
  "Buiten bedrijf / demontage"
];
