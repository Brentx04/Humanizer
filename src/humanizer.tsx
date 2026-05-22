import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Lang = "en" | "nl" | "fr";
type Rule = [RegExp, string, string];
type RuleGroup = { cat: string; color: string; level: 1 | 2 | 3; rules: Rule[] };
type Change = { cat: string; color: string; original: string; replacement: string; label: string };
type GroupedChanges = Record<string, { color: string; items: Change[] }>;
type HumanizerResult = {
  text: string; highlighted: string; changes: Change[];
  beforeCount: number; afterCount: number; grouped: GroupedChanges; aiScore: number;
};
type Intensity = 1 | 2 | 3;

// ─────────────────────────────────────────────────────────────────────────────
// UI STRINGS
// ─────────────────────────────────────────────────────────────────────────────

const UI: Record<Lang, {
  tagline: string; inputLabel: string; placeholder: string;
  words: string; chars: string; clear: string; intensity: string;
  intensityLabels: Record<Intensity, string>; categories: string;
  toggleCats: string; all: string; none: string;
  humanize: string; shortcut: string; aiSig: string;
  scoreLabels: [string, string, string, string, string];
  tabs: [string, string, string]; copy: string; copyDiff: string;
  copied: string; before: string; after: string;
  noPatterns: string; patterns: string; words2: string;
  catFixed: string; aiScore: string; sigComp: string; breakdown: string;
  footer: string;
}> = {
  en: {
    tagline: "No API · No calls · Runs entirely in your browser",
    inputLabel: "Paste AI-sounding text",
    placeholder: "The platform serves as a pivotal testament to the evolving landscape of collaborative innovation, underscoring its vital role in fostering synergistic outcomes...",
    words: "words", chars: "chars", clear: "Clear ×",
    intensity: "Intensity",
    intensityLabels: { 1: "Light", 2: "Medium", 3: "Aggressive" },
    categories: "categories", toggleCats: "Toggle categories",
    all: "All", none: "None",
    humanize: "Humanize →", shortcut: "Ctrl + Enter",
    aiSig: "AI Signature",
    scoreLabels: ["Human", "Mostly Human", "Mixed", "AI-Heavy", "Heavily AI"],
    tabs: ["Final", "Changes", "Stats"],
    copy: "Copy", copyDiff: "Copy diff", copied: "✓ Copied",
    before: "Before", after: "After",
    noPatterns: "No AI patterns detected. Text looks human already.",
    patterns: "Patterns removed", words2: "Words", catFixed: "Categories fixed", aiScore: "AI score",
    sigComp: "AI signature comparison", breakdown: "Breakdown by category",
    footer: "Based on Wikipedia's Signs of AI Writing · WikiProject AI Cleanup · 20 rule categories · 250+ patterns",
  },
  nl: {
    tagline: "Geen API · Geen verzoeken · Draait volledig in uw browser",
    inputLabel: "Plak AI-klinkende tekst",
    placeholder: "Het platform dient als een cruciaal bewijs van het evoluerende landschap van samenwerkingsinnovatie, wat de vitale rol bij het bevorderen van synergetische resultaten onderstreept...",
    words: "woorden", chars: "tekens", clear: "Wissen ×",
    intensity: "Intensiteit",
    intensityLabels: { 1: "Licht", 2: "Gemiddeld", 3: "Agressief" },
    categories: "categorieën", toggleCats: "Categorieën wisselen",
    all: "Alle", none: "Geen",
    humanize: "Vermenselijken →", shortcut: "Ctrl + Enter",
    aiSig: "AI-handtekening",
    scoreLabels: ["Menselijk", "Grotendeels menselijk", "Gemengd", "Zwaar AI", "Sterk AI"],
    tabs: ["Resultaat", "Wijzigingen", "Statistieken"],
    copy: "Kopiëren", copyDiff: "Diff kopiëren", copied: "✓ Gekopieerd",
    before: "Voor", after: "Na",
    noPatterns: "Geen AI-patronen gevonden. Tekst klinkt al menselijk.",
    patterns: "Patronen verwijderd", words2: "Woorden", catFixed: "Categorieën hersteld", aiScore: "AI-score",
    sigComp: "AI-handtekening vergelijking", breakdown: "Uitsplitsing per categorie",
    footer: "Gebaseerd op Wikipedia's Signs of AI Writing · WikiProject AI Cleanup · 14 regelcategorieën · 150+ patronen",
  },
  fr: {
    tagline: "Pas d'API · Pas d'appels · Fonctionne entièrement dans votre navigateur",
    inputLabel: "Collez un texte généré par IA",
    placeholder: "La plateforme sert de témoignage central du paysage évolutif de l'innovation collaborative, soulignant son rôle vital dans la promotion de résultats synergiques...",
    words: "mots", chars: "caractères", clear: "Effacer ×",
    intensity: "Intensité",
    intensityLabels: { 1: "Légère", 2: "Moyenne", 3: "Agressive" },
    categories: "catégories", toggleCats: "Basculer les catégories",
    all: "Tout", none: "Aucun",
    humanize: "Humaniser →", shortcut: "Ctrl + Entrée",
    aiSig: "Signature IA",
    scoreLabels: ["Humain", "Surtout humain", "Mixte", "Fortement IA", "Très IA"],
    tabs: ["Résultat", "Modifications", "Statistiques"],
    copy: "Copier", copyDiff: "Copier diff", copied: "✓ Copié",
    before: "Avant", after: "Après",
    noPatterns: "Aucun motif IA détecté. Le texte semble déjà humain.",
    patterns: "Motifs supprimés", words2: "Mots", catFixed: "Catégories corrigées", aiScore: "Score IA",
    sigComp: "Comparaison de signature IA", breakdown: "Répartition par catégorie",
    footer: "Basé sur Signs of AI Writing de Wikipédia · WikiProject AI Cleanup · 14 catégories · 150+ motifs",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RULES — ENGLISH  (level 1=light · 2=medium · 3=aggressive)
// ─────────────────────────────────────────────────────────────────────────────

const RULES_EN: RuleGroup[] = [
  { cat: "Formatting", color: "#7f8c8d", level: 1, rules: [
    [/"|"/g, '"', "curly double quotes → straight"],
    [/'|'/g, "'", "curly single quotes → straight"],
    [/\s*—\s*/g, ", ", "em dash → comma"],
    [/\*\*([^*]+)\*\*/g, "$1", "boldface removed"],
    [/^\s*[🚀💡✅🎯🔑⚡🌟💎🔥👉📌📊🎉]+\s*/gm, "", "emojis removed"],
  ]},
  { cat: "Chatbot artifacts", color: "#e74c3c", level: 1, rules: [
    [/\bGreat question[!.]?\s*/gi, "", "removed 'Great question!'"],
    [/\bCertainly[!,]?\s*/gi, "", "removed 'Certainly!'"],
    [/\bOf course[!,]?\s*/gi, "", "removed 'Of course!'"],
    [/\bAbsolutely[!,]?\s*/gi, "", "removed 'Absolutely!'"],
    [/\bSure thing[!,]?\s*/gi, "", "removed 'Sure thing!'"],
    [/\bHappy to help[.!]?\s*/gi, "", "removed 'Happy to help'"],
    [/\bAs an AI( language model)?,?\s*/gi, "", "removed AI self-reference"],
    [/\bI(?:'m| am) here to help[.!]?\s*/gi, "", "removed chatbot phrase"],
    [/\bI hope this (?:helps|answer|assist)[^.]*\.\s*/gi, "", "removed 'I hope this helps'"],
    [/\bLet me know if you(?:'d like| have| need)[^.]*\.\s*/gi, "", "removed chatbot offer"],
    [/\bFeel free to (?:ask|reach out)[^.]*\.\s*/gi, "", "removed 'Feel free to ask'"],
    [/\bDon't hesitate to[^.]*\.\s*/gi, "", "removed 'Don't hesitate to'"],
    [/\bWould you like me to[^?]*\?\s*/gi, "", "removed chatbot question"],
    [/\bHere is (?:a |an |the )?(?:overview|summary|breakdown|look)[^.]*\.\s*/gi, "", "removed chatbot intro"],
    [/\bAs requested[,.]?\s*/gi, "", "removed 'As requested'"],
    [/\bTo address your (?:question|query|concern)[,.]?\s*/gi, "", "removed chatbot opener"],
  ]},
  { cat: "Knowledge-cutoff disclaimers", color: "#95a5a6", level: 1, rules: [
    [/\bAs of (?:my |the )?(?:last |latest )?(?:training |knowledge )?(?:update|cutoff|data)[^,.]*/gi, "", "removed cutoff disclaimer"],
    [/\bWhile specific details (?:are|remain) (?:limited|scarce|unavailable)[^,.]*, /gi, "", "removed cutoff hedge"],
    [/\bbased on (?:the )?(?:currently )?available information[,.]?\s*/gi, "", "removed info hedge"],
    [/\bat the time of (?:this )?writing[,.]?\s*/gi, "", "removed 'at time of writing'"],
    [/\bup to my (?:last |latest )?(?:training|knowledge)[^,.]*/gi, "", "removed training reference"],
    [/\bmy (?:knowledge|training) (?:has a )?cutoff[^,.]*/gi, "", "removed cutoff reference"],
  ]},
  { cat: "Sycophantic tone", color: "#e67e22", level: 1, rules: [
    [/\bYou(?:'re| are) absolutely right[.!,]?\s*/gi, "", "removed sycophancy"],
    [/\bThat(?:'s| is) (?:a )?(?:great|excellent|wonderful|fantastic|brilliant) (?:point|question|observation)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bExcellent (?:point|question|observation)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bI(?:'m| am) glad you (?:asked|mentioned|brought up) that[.!,]?\s*/gi, "", "removed sycophancy"],
    [/\bThis is (?:a )?(?:great|excellent|wonderful|fantastic|brilliant|pertinent) (?:question|topic)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bWhat a (?:great|wonderful|excellent|fantastic) (?:question|point|idea)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bI appreciate (?:your|this) (?:question|insight|perspective)[.!,]?\s*/gi, "", "removed sycophancy"],
  ]},
  { cat: "Signposting", color: "#27ae60", level: 2, rules: [
    [/\bLet(?:'s| us) dive (?:in|into)[.!]?\s*/gi, "", "removed 'Let's dive in'"],
    [/\bLet(?:'s| us) explore\b[^.]*\.\s*/gi, "", "removed 'Let's explore'"],
    [/\bLet(?:'s| us) break (?:this|it) down[.!]?\s*/gi, "", "removed signpost"],
    [/\bLet(?:'s| us) take a (?:closer |deeper )?look at\b\s*/gi, "", "removed signpost"],
    [/\bHere(?:'s| is) what you need to know[.:!]?\s*/gi, "", "removed signpost"],
    [/\bWithout further ado[,.]?\s*/gi, "", "removed 'Without further ado'"],
    [/\bNow let(?:'s| us) (?:look at|turn to|examine|consider|explore)\b\s*/gi, "", "removed signpost"],
    [/\bI(?:'ll| will) (?:walk|take) you through\b\s*/gi, "", "removed signpost"],
    [/\bLet me (?:walk you through|break down|explain)\b\s*/gi, "", "removed signpost"],
    [/\bIn this (?:article|post|piece|guide|overview), (?:we(?:'ll| will)|I(?:'ll| will)) (?:explore|examine|look at|cover|discuss)\b[^.]*\.\s*/gi, "", "removed meta-intro"],
    [/\bBefore (?:we|I) (?:dive|get) into\b[^,]*,\s*/gi, "", "removed signpost"],
    [/\bWith that (?:said|in mind)[,.]?\s*/gi, "", "removed signpost"],
  ]},
  { cat: "Filler openers & phrases", color: "#2980b9", level: 2, rules: [
    [/\bIn today's (?:rapidly )?(?:evolving |changing |modern |fast[- ]paced |digital )?world[,.]?\s*/gi, "", "removed filler opener"],
    [/\bIn today's (?:rapidly )?(?:evolving |changing |modern |fast[- ]paced |digital )?(?:age|era|climate|society)[,.]?\s*/gi, "", "removed filler opener"],
    [/\bIn the realm of\b\s*/gi, "In ", "simplified 'In the realm of'"],
    [/\bIn the (?:world|domain|sphere|arena) of\b\s*/gi, "In ", "simplified abstract location"],
    [/\bAt its core[,.]?\s*/gi, "", "removed 'At its core'"],
    [/\bIn order to\b/gi, "To", "simplified 'In order to'"],
    [/\bIt is (?:important|crucial|essential|critical) to note that\s*/gi, "", "removed filler"],
    [/\bIt(?:'s| is) worth (?:noting|mentioning|pointing out) that\s*/gi, "", "removed filler"],
    [/\bIt should be noted that\s*/gi, "", "removed filler"],
    [/\bNeedless to say[,.]?\s*/gi, "", "removed 'Needless to say'"],
    [/\bFirst and foremost[,.]?\s*/gi, "First, ", "simplified 'First and foremost'"],
    [/\bLast but not least[,.]?\s*/gi, "Finally, ", "simplified 'Last but not least'"],
    [/\bIn the grand scheme of things[,.]?\s*/gi, "", "removed filler"],
    [/\bAt the end of the day[,.]?\s*/gi, "", "removed cliché"],
    [/\bWhen all is said and done[,.]?\s*/gi, "", "removed filler"],
    [/\bAll things considered[,.]?\s*/gi, "", "removed filler"],
    [/\bAll in all[,.]?\s*/gi, "", "removed filler"],
    [/\bIn conclusion[,.]?\s*/gi, "", "removed 'In conclusion'"],
    [/\bIn summary[,.]?\s*/gi, "", "removed 'In summary'"],
    [/\bTo sum up[,.]?\s*/gi, "", "removed 'To sum up'"],
    [/\bIn a nutshell[,.]?\s*/gi, "", "removed 'In a nutshell'"],
    [/\bTo put it (?:simply|plainly|briefly)[,.]?\s*/gi, "", "removed filler"],
    [/\bSimply put[,.]?\s*/gi, "", "removed 'Simply put'"],
    [/\bThat (?:being|said)[,.]?\s*/gi, "", "removed 'That being said'"],
    [/\bIn other words[,.]?\s*/gi, "", "removed 'In other words'"],
  ]},
  { cat: "Generic endings", color: "#c0392b", level: 2, rules: [
    [/\bThe future (?:looks|seems|appears) bright[.!]?\s*/gi, "", "removed generic ending"],
    [/\bExciting times (?:lie |are )?ahead[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe possibilities are endless[.!]?\s*/gi, "", "removed generic ending"],
    [/\bOnly time will tell[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe sky is the limit[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThis is just the beginning[.!]?\s*/gi, "", "removed generic ending"],
    [/\bWatch this space[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThis represents a (?:major |significant )?step in the right direction[.!]?\s*/gi, "", "removed generic ending"],
    [/\bWe(?:'re| are) (?:just )?(?:scratching the surface|getting started)[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe journey (?:continues|is just beginning)[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe best is yet to come[.!]?\s*/gi, "", "removed generic ending"],
    [/\bTime will tell[.!]?\s*/gi, "", "removed generic ending"],
  ]},
  { cat: "Persuasive authority", color: "#d35400", level: 2, rules: [
    [/\bThe real question is\b/gi, "The question is", "deflated 'The real question'"],
    [/\bWhat really matters (?:here )?is\b/gi, "What matters is", "deflated 'What really matters'"],
    [/\bAt the heart of (?:this|it|the matter) (?:lies?|is)\b/gi, "The core issue is", "simplified 'At the heart'"],
    [/\bThe (?:deeper|fundamental|underlying) (?:issue|truth|reality|point) (?:here )?is\b/gi, "The issue is", "simplified persuasive frame"],
    [/\bMake no mistake about it[,:]?\s*/gi, "", "removed 'Make no mistake'"],
    [/\bMake no mistake[,:]?\s*/gi, "", "removed 'Make no mistake'"],
    [/\bThe fact of the matter is\b\s*/gi, "", "removed authority phrase"],
    [/\bIn reality[,.]?\s*/gi, "", "removed 'In reality'"],
    [/\bFundamentally[,.]?\s*/gi, "", "removed 'Fundamentally'"],
    [/\bThe truth is[,.]?\s*/gi, "", "removed 'The truth is'"],
    [/\bHere's the thing[,:]?\s*/gi, "", "removed 'Here's the thing'"],
    [/\bLet(?:'s| us) be (?:clear|honest|frank)[,:]?\s*/gi, "", "removed authority opener"],
  ]},
  { cat: "Significance inflation", color: "#8e44ad", level: 2, rules: [
    [/\bserved? as (?:a |an )?(?:pivotal |vital |enduring |lasting )?testament to\b/gi, "shows", "simplified testament"],
    [/\bstood? as (?:a |an )?(?:pivotal |vital |enduring |lasting )?testament to\b/gi, "showed", "simplified testament"],
    [/\bstands? as (?:a |an )?(?:pivotal |vital |enduring |lasting )?testament to\b/gi, "shows", "simplified testament"],
    [/\bmarks? a pivotal moment in\b/gi, "changed", "deflated pivotal moment"],
    [/\bpivotal moment\b/gi, "turning point", "deflated 'pivotal moment'"],
    [/\bin today's rapidly evolving (?:technological |digital |)?landscape\b/gi, "today", "deflated landscape"],
    [/\bevolving landscape of\b/gi, "field of", "simplified landscape"],
    [/\bthe (?:broader |wider )?landscape of\b\s*/gi, "", "removed abstract landscape"],
    [/\bunderscore[sd]? (?:the |its |their )?(?:importance|significance|value|vital role)\b/gi, "shows", "simplified underscores"],
    [/\bhighlight[sd]? (?:the |its |their )?(?:importance|significance)\b/gi, "show", "simplified highlights"],
    [/\bsetting the stage for\b/gi, "before", "simplified stage-setting"],
    [/\bdeeply rooted in\b/gi, "based in", "simplified 'deeply rooted'"],
    [/\bindelible mark\b/gi, "lasting effect", "simplified 'indelible mark'"],
    [/\bfocal point\b/gi, "focus", "simplified 'focal point'"],
    [/\bkey turning point\b/gi, "turning point", "removed redundant 'key'"],
    [/\bpivotal role\b/gi, "role", "removed 'pivotal'"],
    [/\bcrucial role\b/gi, "role", "removed 'crucial'"],
    [/\bvital role\b/gi, "role", "removed 'vital'"],
    [/\bsignificant role\b/gi, "role", "removed 'significant'"],
    [/\bhas left an? (?:lasting |enduring |indelible )?impact on\b/gi, "affected", "simplified impact phrase"],
    [/\breflects? (?:a )?broader\b/gi, "reflects", "removed 'broader'"],
    [/\bsymboliz(?:es?|ing) (?:its |the )?(?:ongoing|enduring|lasting)\b/gi, "shows", "simplified symbolizing"],
    [/\bcontribut(?:es?|ing) to (?:the )?(?:ongoing|broader|wider)\b/gi, "affects", "simplified contributes to"],
    [/\bshaping the (?:future|course|direction) of\b/gi, "affecting", "simplified 'shaping the future'"],
    [/\bhistoric(?:al)? milestone\b/gi, "milestone", "removed 'historic'"],
    [/\blandmark (study|research|paper|work|decision)\b/gi, "influential $1", "simplified 'landmark'"],
    [/\bmonumental\b/gi, "large", "deflated 'monumental'"],
  ]},
  { cat: "Promotional language", color: "#16a085", level: 2, rules: [
    [/\bgroundbreaking\b/gi, "new", "deflated 'groundbreaking'"],
    [/\brevolutionary\b/gi, "new", "deflated 'revolutionary'"],
    [/\btransformative potential\b/gi, "potential", "simplified"],
    [/\btransformative\b/gi, "significant", "deflated 'transformative'"],
    [/\bnestled (?:at the intersection|within|in the heart) of\b/gi, "in", "simplified nestled"],
    [/\bin the heart of\b/gi, "in", "simplified"],
    [/\bseamless(?:ly)?\b/gi, "smooth", "replaced 'seamless'"],
    [/\brobust\b/gi, "strong", "replaced 'robust'"],
    [/\bunlock(?:s|ed|ing)? (?:the )?(?:full )?potential of\b/gi, "get more from", "simplified unlock potential"],
    [/\bgame[- ]changer\b/gi, "significant shift", "deflated 'game-changer'"],
    [/\bgame[- ]changing\b/gi, "significant", "deflated 'game-changing'"],
    [/\bcutting[- ]edge\b/gi, "modern", "replaced cutting-edge"],
    [/\bstate[- ]of[- ]the[- ]art\b/gi, "modern", "replaced state-of-the-art"],
    [/\bbest[- ]in[- ]class\b/gi, "top", "deflated best-in-class"],
    [/\bworld[- ]class\b/gi, "", "removed 'world-class'"],
    [/\bsynerg(?:y|ies|istic|ize[sd]?)\b/gi, "cooperation", "replaced synergy"],
    [/\bparadigm shift\b/gi, "major change", "replaced paradigm shift"],
    [/\bholistic approach\b/gi, "complete approach", "simplified holistic"],
    [/\bholistic\b/gi, "thorough", "replaced 'holistic'"],
    [/\bempowers?\b/gi, "helps", "replaced 'empowers'"],
    [/\bempowered\b/gi, "helped", "replaced 'empowered'"],
    [/\bempowering\b/gi, "helping", "replaced 'empowering'"],
    [/\bempowerment\b/gi, "support", "replaced 'empowerment'"],
    [/\bstreamlines?\b/gi, "simplifies", "replaced 'streamlines'"],
    [/\bstreamlined\b/gi, "simplified", "replaced 'streamlined'"],
    [/\bstreamlining\b/gi, "simplifying", "replaced 'streamlining'"],
    [/\binnovative solution\b/gi, "solution", "removed 'innovative'"],
    [/\binnovative approach\b/gi, "approach", "removed 'innovative'"],
    [/\binnovative\b/gi, "new", "replaced 'innovative'"],
    [/\bdisruptive\b/gi, "new", "replaced 'disruptive'"],
    [/\bbleeding[- ]edge\b/gi, "latest", "replaced bleeding-edge"],
    [/\bforward[- ]thinking\b/gi, "", "removed 'forward-thinking'"],
    [/\bfuture[- ]proof(?:ed|ing)?\b/gi, "durable", "replaced future-proof"],
    [/\bboasts?\b/gi, "has", "replaced 'boasts'"],
    [/\bvibrant\b/gi, "lively", "replaced 'vibrant'"],
    [/\bbreathtaking\b/gi, "", "removed 'breathtaking'"],
    [/\bstunning\b(?! defeat| loss| blow)/gi, "", "removed 'stunning'"],
    [/\brenowned\b/gi, "known", "replaced 'renowned'"],
    [/\bmust[- ]visit\b/gi, "worth visiting", "replaced 'must-visit'"],
    [/\bnext[- ]gen(?:eration)?\b/gi, "new", "replaced 'next-gen'"],
    [/\bbest[- ]in[- ]breed\b/gi, "top", "deflated 'best-in-breed'"],
  ]},
  { cat: "Copula avoidance", color: "#2ecc71", level: 3, rules: [
    [/\bserves as\b/gi, "is", "serves as → is"],
    [/\bserved as\b/gi, "was", "served as → was"],
    [/\bserve as\b/gi, "be", "serve as → be"],
    [/\bserving as\b/gi, "being", "serving as → being"],
    [/\bfunctions as\b/gi, "is", "functions as → is"],
    [/\bfunctioned as\b/gi, "was", "functioned as → was"],
    [/\bstands as\b/gi, "is", "stands as → is"],
    [/\bstood as\b/gi, "was", "stood as → was"],
    [/\bacts as\b/gi, "is", "acts as → is"],
    [/\bacted as\b/gi, "was", "acted as → was"],
    [/\boperates as\b/gi, "is", "operates as → is"],
    [/\brepresents\b(?= (?:a |an |the ))/gi, "is", "represents → is"],
    [/\brepresented\b(?= (?:a |an |the ))/gi, "was", "represented → was"],
    [/\bmarks\b(?= (?:a |an |the ))/gi, "is", "marks → is (copula)"],
    [/\bfeatures\b(?= (?:a |an |the ))/gi, "has", "features → has"],
  ]},
  { cat: "AI vocabulary", color: "#c0392b", level: 2, rules: [
    [/\bdelves? into\b/gi, "looks into", "delve → look into"],
    [/\bdelve\b/gi, "look", "delve → look"],
    [/\bnuanced (?:understanding|approach|perspective|view|analysis)\b/gi, "careful understanding", "deflated nuanced"],
    [/\bnuanced\b/gi, "complex", "replaced 'nuanced'"],
    [/\bmultifaceted\b/gi, "complex", "replaced 'multifaceted'"],
    [/\bcomprehensive overview\b/gi, "overview", "simplified comprehensive overview"],
    [/\bcomprehensive guide\b/gi, "guide", "simplified"],
    [/\bcomprehensive\b/gi, "thorough", "replaced 'comprehensive'"],
    [/\bfacilitates?\b/gi, "helps", "facilitate → help"],
    [/\bfacilitated\b/gi, "helped", "facilitated → helped"],
    [/\butilizes?\b/gi, "uses", "utilize → use"],
    [/\butilized\b/gi, "used", "utilized → used"],
    [/\butilization\b/gi, "use", "utilization → use"],
    [/\bleverages?\b(?! itself| themselves)/gi, "uses", "leverage → use"],
    [/\bleveraged\b/gi, "used", "leveraged → used"],
    [/\boptimizes?\b/gi, "improves", "optimize → improve"],
    [/\boptimized\b/gi, "improved", "optimized → improved"],
    [/\boptimizing\b/gi, "improving", "optimizing → improving"],
    [/\boptimization\b/gi, "improvement", "optimization → improvement"],
    [/\bimpactful\b/gi, "effective", "replaced 'impactful'"],
    [/\bactionable insights?\b/gi, "practical findings", "replaced actionable insights"],
    [/\bactionable (?:steps?|tips?|advice)\b/gi, "practical advice", "replaced actionable"],
    [/\bactionable\b/gi, "practical", "replaced 'actionable'"],
    [/\bscalable\b/gi, "flexible", "replaced 'scalable'"],
    [/\bjourney\b(?= (?:of|toward|to|into|through))/gi, "path", "journey → path"],
    [/\becosystem\b(?! (?:of animals|restoration|conservation|damage|services))/gi, "environment", "ecosystem → environment"],
    [/\bdeep[- ]dive\b/gi, "detailed look", "deep-dive → detailed look"],
    [/\btake[sd]? (?:a )?(?:deep|closer) dive\b/gi, "look carefully", "take a deep dive → look carefully"],
    [/\bmoves? the needle\b/gi, "makes progress", "move the needle → make progress"],
    [/\blow[- ]hanging fruit\b/gi, "easy wins", "low-hanging fruit → easy wins"],
    [/\bpain points?\b/gi, "problems", "pain point → problem"],
    [/\bvalue proposition\b/gi, "value", "value proposition → value"],
    [/\bthought leader(?:ship)?\b/gi, "expertise", "thought leadership → expertise"],
    [/\bunpack(?:s|ed|ing)?\b/gi, "explain", "unpack → explain"],
    [/\bbest practice[sd]?\b/gi, "good approach", "best practice → good approach"],
    [/\bpivotal\b/gi, "key", "pivotal → key"],
    [/\benhances?\b/gi, "improves", "enhance → improve"],
    [/\benhanced\b/gi, "improved", "enhanced → improved"],
    [/\benhancing\b/gi, "improving", "enhancing → improving"],
    [/\bfosters?\b/gi, "builds", "foster → build"],
    [/\bfostered\b/gi, "built", "fostered → built"],
    [/\bfostering\b/gi, "building", "fostering → building"],
    [/\bgarners?\b/gi, "gets", "garner → get"],
    [/\bgarned\b/gi, "got", "garnered → got"],
    [/\bshowcase[sd]?\b/gi, "show", "showcase → show"],
    [/\bshowcasing\b/gi, "showing", "showcasing → showing"],
    [/\btapestry\b/gi, "mix", "tapestry → mix"],
    [/\binterplay\b/gi, "relationship", "interplay → relationship"],
    [/\bintricate\b/gi, "complex", "intricate → complex"],
    [/\bendeavors?\b/gi, "tries", "endeavor → try"],
    [/\bcommences?\b/gi, "starts", "commence → start"],
    [/\bcommenced\b/gi, "started", "commenced → started"],
    [/\bprioritize[sd]?\b/gi, "focus on", "prioritize → focus on"],
    [/\bdemonstrates?\b/gi, "shows", "demonstrate → show"],
    [/\bdemonstrated\b/gi, "showed", "demonstrated → showed"],
    [/\bspearhead(?:s|ed|ing)?\b/gi, "lead", "spearhead → lead"],
    [/\bcatalyze[sd]?\b/gi, "drive", "catalyze → drive"],
    [/\bchampion(?:s|ed|ing)?\b/gi, "support", "champion → support"],
    [/\bsynthesize[sd]?\b/gi, "combine", "synthesize → combine"],
    [/\bstems? from\b/gi, "comes from", "stem from → come from"],
    [/\bpertains? to\b/gi, "relates to", "pertain to → relate to"],
    [/\baligns? with\b/gi, "matches", "aligns with → matches"],
    [/\bconstitutes?\b/gi, "is", "constitute → is"],
    [/\bencompasses?\b/gi, "includes", "encompasses → includes"],
    [/\bembodies\b/gi, "represents", "embodies → represents"],
    [/\bembodied\b/gi, "represented", "embodied → represented"],
    [/\belucidates?\b/gi, "explains", "elucidate → explain"],
    [/\billuminates?\b/gi, "shows", "illuminate → show"],
    [/\bmanifests?\b(?= (?:as|in|itself))/gi, "appears", "manifests → appears"],
    [/\bexemplifies?\b/gi, "shows", "exemplify → show"],
    [/\bepitomizes?\b/gi, "is", "epitomize → is"],
    [/\bencapsulates?\b/gi, "sums up", "encapsulate → sum up"],
    [/\bdelineates?\b/gi, "outlines", "delineate → outline"],
    [/\baccentuates?\b/gi, "highlights", "accentuate → highlight"],
    [/\bperpetuates?\b/gi, "continues", "perpetuate → continue"],
    [/\bmirrors?\b(?= (?:the|a|an|that|this|those|these))/gi, "matches", "mirrors → matches"],
    [/\bechoes?\b(?= (?:the|a|an|that|this|those|these))/gi, "reflects", "echoes → reflects"],
  ]},
  { cat: "Excessive hedging", color: "#7f8c8d", level: 3, rules: [
    [/\bit could (?:potentially |possibly )?be argued that\s*/gi, "", "removed hedge"],
    [/\bone could (?:potentially |possibly )?argue that\s*/gi, "", "removed hedge"],
    [/\bmight (?:potentially |possibly )?have some\b/gi, "may have", "simplified hedge"],
    [/\bit (?:can|may|could) (?:be said|be argued) that\s*/gi, "", "removed hedge"],
    [/\bpotentially\b/gi, "possibly", "potentially → possibly"],
    [/\bin (?:some|certain|many) (?:cases|instances|situations)[,.]?\s*/gi, "sometimes", "simplified hedge"],
    [/\bunder (?:certain|some) circumstances\b/gi, "sometimes", "simplified"],
    [/\bto (?:a certain|some) extent\b/gi, "somewhat", "simplified hedge"],
    [/\bit (?:is|seems|appears) (?:clear|evident|obvious) that\s*/gi, "", "removed false clarity"],
    [/\bit (?:is|was) (?:generally )?(?:believed|thought|considered) that\s*/gi, "", "removed weasel intro"],
    [/\bsome might (?:argue|say|suggest) that\s*/gi, "", "removed vague hedge"],
    [/\bit (?:is|may be|could be) (?:worth|helpful) (?:noting|mentioning) that\s*/gi, "", "removed hedge"],
    [/\bit is important to (?:recognize|understand|acknowledge|note) that\s*/gi, "", "removed filler hedge"],
    [/\bit should be (?:emphasized|noted|highlighted|stressed) that\s*/gi, "", "removed filler hedge"],
    [/\bit is (?:crucial|essential|critical|vital) to (?:recognize|understand|note) that\s*/gi, "", "removed filler hedge"],
    [/\bit goes without saying that\s*/gi, "", "removed 'it goes without saying'"],
    [/\bsuffice it to say(?:,)?\s*/gi, "", "removed 'suffice it to say'"],
  ]},
  { cat: "Vague attributions", color: "#1abc9c", level: 3, rules: [
    [/\bexperts? (?:say|argue|believe|suggest|claim|note|warn)\b/gi, "researchers say", "vague expert → researchers"],
    [/\bindustry (?:observers?|analysts?|experts?) (?:note|say|suggest|argue)\b/gi, "analysts say", "vague attribution simplified"],
    [/\bsome (?:critics?|experts?|observers?) (?:argue|say|suggest|claim)\b/gi, "some argue", "simplified vague attribution"],
    [/\bwidely (?:regarded|considered|seen) as\b/gi, "considered", "simplified widely regarded"],
    [/\bcommonly (?:known|regarded|considered) as\b/gi, "known as", "simplified"],
    [/\bmany (?:believe|think|argue|feel) that\s*/gi, "", "removed vague many"],
    [/\bsome (?:believe|think|argue|feel) that\s*/gi, "", "removed vague some"],
    [/\bpeople (?:often|generally|tend to) (?:believe|think|feel)\s*/gi, "", "removed vague people"],
    [/\bit is (?:widely|commonly|generally) (?:accepted|known|believed) that\s*/gi, "", "removed vague attribution"],
  ]},
  { cat: "Negative parallelism", color: "#d35400", level: 3, rules: [
    [/\bIt(?:'s| is) not just ([^;.]+); it(?:'s| is) ([^.]+)\./gi, "It's $2.", "collapsed not-just parallelism"],
    [/\bNot (?:just |only )([^,]+), but (?:also )?([^.]+)\./gi, "$2.", "collapsed not-only parallelism"],
    [/\bMore than just ([^,]+), (?:it(?:'s| is)|this is) ([^.]+)\./gi, "It's $2.", "collapsed more-than parallelism"],
    [/\bIt(?:'s| is) not (?:merely|simply|just) ([^;,.]+)[;,] it(?:'s| is) ([^.]+)\./gi, "It's $2.", "collapsed not-merely parallelism"],
  ]},
  { cat: "Wordy phrases", color: "#2c3e50", level: 2, rules: [
    [/\bdue to the fact that\b/gi, "because", "simplified wordy phrase"],
    [/\bin (?:light|view) of the fact that\b/gi, "because", "simplified"],
    [/\bfor the purpose of\b/gi, "to", "simplified"],
    [/\bwith (?:regard|respect) to\b/gi, "about", "simplified"],
    [/\bon the basis of\b/gi, "based on", "simplified"],
    [/\bprior to\b/gi, "before", "prior to → before"],
    [/\bsubsequent to\b/gi, "after", "subsequent to → after"],
    [/\bin (?:the )?(?:event|case) (?:that|of)\b/gi, "if", "simplified"],
    [/\ba (?:large|great|significant|substantial) number of\b/gi, "many", "simplified quantity phrase"],
    [/\ba (?:large|great|significant|substantial) amount of\b/gi, "much", "simplified"],
    [/\bthe (?:vast|overwhelming) majority of\b/gi, "most", "simplified majority phrase"],
    [/\bon a (?:daily|regular|consistent) basis\b/gi, "regularly", "simplified"],
    [/\bat this (?:point|moment|juncture) in time\b/gi, "now", "simplified"],
    [/\bin the (?:near|not-too-distant) future\b/gi, "soon", "simplified"],
    [/\bmake[sd]? a decision\b/gi, "decide", "simplified"],
    [/\btake[sd]? (?:into )?(?:account|consideration)\b/gi, "consider", "simplified"],
    [/\bhas the ability to\b/gi, "can", "simplified"],
    [/\bhas the capacity to\b/gi, "can", "simplified"],
    [/\bis able to\b/gi, "can", "is able to → can"],
    [/\bin an effort to\b/gi, "to", "simplified"],
    [/\bfor the (?:simple )?reason that\b/gi, "because", "simplified"],
    [/\bwith a view to\b/gi, "to", "simplified"],
    [/\bso as to\b/gi, "to", "simplified"],
    [/\ba total of\b/gi, "", "removed 'a total of'"],
    [/\bthe fact that\b/gi, "that", "simplified 'the fact that'"],
    [/\bby means of\b/gi, "using", "simplified"],
    [/\bmake use of\b/gi, "use", "simplified"],
    [/\bin the process of\b/gi, "currently", "simplified"],
    [/\bfrom the perspective of\b/gi, "for", "simplified"],
    [/\bin terms of\b/gi, "for", "simplified 'in terms of'"],
    [/\bwith the (?:aim|goal|objective|intention) of\b/gi, "to", "simplified"],
    [/\bin (?:a|an) (?:similar|analogous) (?:way|manner|fashion)\b/gi, "similarly", "simplified"],
  ]},
  { cat: "Passive voice", color: "#16a085", level: 3, rules: [
    [/\bit is (?:widely )?(?:known|understood|accepted|recognized) that\s*/gi, "", "removed passive opener"],
    [/\bit has been (?:widely )?(?:shown|noted|observed|demonstrated) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:has been|was) (?:widely )?(?:reported|noted|observed) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:has been|was) (?:found|established|determined) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:is|was) (?:expected|anticipated|predicted) that\s*/gi, "", "removed passive opener"],
  ]},
  { cat: "Hyphenated word pairs", color: "#8e44ad", level: 3, rules: [
    [/\bcross[- ]functional\b/gi, "cross functional", "unhyphenated"],
    [/\bclient[- ]facing\b/gi, "client facing", "unhyphenated"],
    [/\bdata[- ]driven\b/gi, "data driven", "unhyphenated"],
    [/\bdecision[- ]making\b/gi, "decision making", "unhyphenated"],
    [/\bwell[- ]known\b/gi, "known", "simplified well-known"],
    [/\bhigh[- ]quality\b/gi, "quality", "simplified high-quality"],
    [/\bend[- ]to[- ]end\b/gi, "complete", "simplified end-to-end"],
    [/\blong[- ]term\b/gi, "long term", "unhyphenated"],
    [/\bshort[- ]term\b/gi, "short term", "unhyphenated"],
    [/\breal[- ]time\b/gi, "real time", "unhyphenated"],
    [/\bopen[- ]ended\b/gi, "open ended", "unhyphenated"],
    [/\bhigh[- ]level\b/gi, "high level", "unhyphenated"],
    [/\blow[- ]level\b/gi, "low level", "unhyphenated"],
  ]},
  { cat: "Academic formality", color: "#3498db", level: 2, rules: [
    [/\bFurthermore[,.]?\s*/gi, "Also, ", "Furthermore → Also"],
    [/\bMoreover[,.]?\s*/gi, "Also, ", "Moreover → Also"],
    [/\bNotwithstanding\b/gi, "Despite", "Notwithstanding → Despite"],
    [/\bNevertheless[,.]?\s*/gi, "Still, ", "Nevertheless → Still"],
    [/\bThus[,.]?\s*/gi, "So, ", "Thus → So"],
    [/\bHence[,.]?\s*/gi, "So, ", "Hence → So"],
    [/\bErgo[,.]?\s*/gi, "So, ", "Ergo → So"],
    [/\bi\.e\.,?\s*/gi, "that is, ", "i.e. → that is"],
    [/\be\.g\.,?\s*/gi, "for example, ", "e.g. → for example"],
    [/\binter alia\b/gi, "among others", "inter alia → among others"],
    [/\bper se\b/gi, "in itself", "per se → in itself"],
    [/\bde facto\b/gi, "in practice", "de facto → in practice"],
    [/\bmethodology\b/gi, "method", "methodology → method"],
    [/\bconceptualize[sd]?\b/gi, "think of", "conceptualize → think of"],
    [/\bcontextualize[sd]?\b/gi, "frame", "contextualize → frame"],
    [/\boperationalize[sd]?\b/gi, "apply", "operationalize → apply"],
    [/\btheorize[sd]?\b/gi, "suggest", "theorize → suggest"],
    [/\bhypothesize[sd]?\b/gi, "suggest", "hypothesize → suggest"],
    [/\bpredicated on\b/gi, "based on", "predicated on → based on"],
    [/\bpremised on\b/gi, "based on", "premised on → based on"],
    [/\bthe aforementioned\b/gi, "the above", "aforementioned → the above"],
    [/\binsofar as\b/gi, "as far as", "insofar as → as far as"],
    [/\binasmuch as\b/gi, "because", "inasmuch as → because"],
    [/\bwhereupon\b/gi, "after which", "whereupon → after which"],
    [/\bis defined (?:by|as)\b/gi, "means", "is defined as → means"],
    [/\bis characterized by\b/gi, "has", "is characterized by → has"],
    [/\bis described as\b/gi, "is called", "is described as → is called"],
    [/\bas opposed to\b/gi, "instead of", "as opposed to → instead of"],
    [/\bin contrast to\b/gi, "unlike", "in contrast to → unlike"],
    [/\bin comparison (?:to|with)\b/gi, "compared to", "in comparison to → compared to"],
    [/\bsubsequently[,.]?\s*/gi, "then, ", "subsequently → then"],
    [/\bconsequently[,.]?\s*/gi, "so, ", "consequently → so"],
    [/\baccordingly[,.]?\s*/gi, "so, ", "accordingly → so"],
    [/\bsimultaneously\b/gi, "at once", "simultaneously → at once"],
    [/\bdespite (?:the fact that|awareness of)\b/gi, "even though", "simplified despite clause"],
    [/\bvoluntary (?:delay|deferral) of\b/gi, "putting off", "deflated formal definition"],
    [/\bthe voluntary\b/gi, "a chosen", "voluntary → chosen"],
    [/\bintended actions?\b/gi, "plans", "intended actions → plans"],
    [/\bnegative consequences?\b/gi, "bad results", "negative consequences → bad results"],
    [/\bemotional regulation\b/gi, "managing emotions", "deflated formal term"],
    [/\btime management\b/gi, "managing time", "time management → managing time"],
  ]},

  { cat: "Adverb inflation", color: "#9b59b6", level: 2, rules: [
    [/\binherently\b/gi, "", "removed 'inherently'"],
    [/\bpredominantly\b/gi, "mostly", "predominantly → mostly"],
    [/\bostensibly\b/gi, "apparently", "ostensibly → apparently"],
    [/\bnotably\b/gi, "", "removed 'notably'"],
    [/\bmarkedly\b/gi, "noticeably", "markedly → noticeably"],
    [/\bessentially\b/gi, "basically", "essentially → basically"],
    [/\bultimately[,.]?\s*/gi, "", "removed 'ultimately'"],
    [/\bsystematically\b/gi, "regularly", "systematically → regularly"],
    [/\bsubstantially\b/gi, "greatly", "substantially → greatly"],
    [/\bconsiderably\b/gi, "greatly", "considerably → greatly"],
    [/\bremarkably\b/gi, "very", "remarkably → very"],
    [/\bverbatim\b/gi, "word for word", "verbatim → word for word"],
    [/\bundeniably\b/gi, "clearly", "undeniably → clearly"],
    [/\bunequivocally\b/gi, "clearly", "unequivocally → clearly"],
    [/\bindisputably\b/gi, "clearly", "indisputably → clearly"],
    [/\binarguably\b/gi, "clearly", "inarguably → clearly"],
    [/\binevitably\b/gi, "always", "inevitably → always"],
    [/\bindeed\b/gi, "", "removed 'indeed'"],
    [/\bcertainly\b(?! (?:not|never))/gi, "", "removed 'certainly'"],
    [/\bapparently\b/gi, "it seems", "apparently → it seems"],
    [/\bpresumably\b/gi, "probably", "presumably → probably"],
    [/\bradically\b/gi, "greatly", "radically → greatly"],
    [/\bprofoundly\b/gi, "deeply", "profoundly → deeply"],
    [/\bprecisely\b/gi, "exactly", "precisely → exactly"],
    [/\bstrikingly\b/gi, "very", "strikingly → very"],
  ]},
];

// ─────────────────────────────────────────────────────────────────────────────
// RULES — DUTCH (NL)
// ─────────────────────────────────────────────────────────────────────────────

const RULES_NL: RuleGroup[] = [
  { cat: "Opmaak", color: "#7f8c8d", level: 1, rules: [
    [/"|"/g, '"', "aanhalingstekens rechtgezet"],
    [/'|'/g, "'", "aanhalingstekens rechtgezet"],
    [/\s*—\s*/g, ", ", "em-dash → komma"],
    [/\*\*([^*]+)\*\*/g, "$1", "vetgedrukt verwijderd"],
    [/^\s*[🚀💡✅🎯🔑⚡🌟💎🔥👉📌📊🎉]+\s*/gm, "", "emoji's verwijderd"],
  ]},
  { cat: "Chatbot uitdrukkingen", color: "#e74c3c", level: 1, rules: [
    [/\bGoede vraag[!.]?\s*/gi, "", "verwijderd 'Goede vraag!'"],
    [/\bZeker[!,]?\s*/gi, "", "verwijderd 'Zeker!'"],
    [/\bNatuurlijk[!,]?\s*/gi, "", "verwijderd 'Natuurlijk!'"],
    [/\bAbsoluut[!,]?\s*/gi, "", "verwijderd 'Absoluut!'"],
    [/\bGraag gedaan[.!]?\s*/gi, "", "verwijderd 'Graag gedaan'"],
    [/\bIk ben hier om (?:u |je )?te helpen[.!]?\s*/gi, "", "verwijderd chatbotzin"],
    [/\bAls AI(?:-taalmodel)?,?\s*/gi, "", "verwijderd AI-zelfverwijzing"],
    [/\bIk hoop dat (?:dit|deze) (?:helpt|antwoord)[^.]*\.\s*/gi, "", "verwijderd 'Ik hoop dat dit helpt'"],
    [/\bLaat (?:het |me )?weten als (?:u|je)[^.]*\.\s*/gi, "", "verwijderd chatbotaanbod"],
    [/\bAarzel niet om[^.]*\.\s*/gi, "", "verwijderd 'Aarzel niet om'"],
    [/\bVoel (?:u|je) vrij om[^.]*\.\s*/gi, "", "verwijderd chatbotfrase"],
    [/\bZoals gevraagd[,.]?\s*/gi, "", "verwijderd 'Zoals gevraagd'"],
    [/\bBedankt voor (?:uw|je) (?:vraag|bericht)[,.]?\s*/gi, "", "verwijderd chatbotopener"],
  ]},
  { cat: "Kennisgrens disclaimers", color: "#95a5a6", level: 1, rules: [
    [/\bOp basis van (?:de )?(?:momenteel )?beschikbare informatie[,.]?\s*/gi, "", "verwijderd infobescherming"],
    [/\bVanaf mijn laatste (?:training|kennisupdate)[^,.]*/gi, "", "verwijderd cutoff-disclaimer"],
    [/\bTen tijde van het schrijven[,.]?\s*/gi, "", "verwijderd tijdsvermijding"],
    [/\bVolgens mijn (?:kennis|training)[^,.]*/gi, "", "verwijderd trainingsverwijzing"],
    [/\bMijn kennis heeft een afsluitdatum[^,.]*/gi, "", "verwijderd kennisgrens"],
  ]},
  { cat: "Vleierige toon", color: "#e67e22", level: 1, rules: [
    [/\bU heeft helemaal gelijk[.!,]?\s*/gi, "", "verwijderd vleierij"],
    [/\bDat is een (?:geweldige|uitstekende|prachtige) (?:vraag|opmerking)[.!,]?\s*/gi, "", "verwijderd lege lof"],
    [/\bUitstekende (?:vraag|opmerking)[.!,]?\s*/gi, "", "verwijderd lege lof"],
    [/\bIk ben blij dat (?:u|je) dat vraagt[.!,]?\s*/gi, "", "verwijderd vleierij"],
    [/\bWat een (?:geweldige|uitstekende) (?:vraag|idee)[.!,]?\s*/gi, "", "verwijderd lege lof"],
    [/\bIk waardeer (?:uw|je) (?:vraag|inzicht)[.!,]?\s*/gi, "", "verwijderd vleierij"],
  ]},
  { cat: "Wegwijzers", color: "#27ae60", level: 2, rules: [
    [/\bLaten we (?:beginnen|duiken)[.!]?\s*/gi, "", "verwijderd wegwijzer"],
    [/\bLaten we (?:dit |eens )?bekijken\b[^.]*\.\s*/gi, "", "verwijderd wegwijzer"],
    [/\bLaten we (?:dit |het )?nader bekijken[.!]?\s*/gi, "", "verwijderd wegwijzer"],
    [/\bHier is wat u moet weten[.:!]?\s*/gi, "", "verwijderd wegwijzer"],
    [/\bZonder verdere omwegen[,.]?\s*/gi, "", "verwijderd frase"],
    [/\bLaat me u door[^.]*leiden[.!]?\s*/gi, "", "verwijderd wegwijzer"],
    [/\bIn dit (?:artikel|stuk|overzicht)[^.]*\.\s*/gi, "", "verwijderd meta-intro"],
    [/\bVoordat we (?:beginnen|duiken)[^,]*,\s*/gi, "", "verwijderd wegwijzer"],
  ]},
  { cat: "Opvulzinnen", color: "#2980b9", level: 2, rules: [
    [/\bIn de huidige (?:snel )?(?:veranderende |digitale |moderne )?wereld[,.]?\s*/gi, "", "verwijderd opvulfrase"],
    [/\bIn het domein van\b\s*/gi, "In ", "vereenvoudigd"],
    [/\bIn de wereld van\b\s*/gi, "In ", "vereenvoudigd"],
    [/\bIn de kern[,.]?\s*/gi, "", "verwijderd 'In de kern'"],
    [/\bTeneinde\b/gi, "Om", "Teneinde → Om"],
    [/\bHet is (?:belangrijk|cruciaal|essentieel) op te merken dat\s*/gi, "", "verwijderd opvulfrase"],
    [/\bHet is de moeite waard om op te merken dat\s*/gi, "", "verwijderd opvulfrase"],
    [/\bOverigens[,.]?\s*/gi, "", "verwijderd 'Overigens'"],
    [/\bAl met al[,.]?\s*/gi, "", "verwijderd 'Al met al'"],
    [/\bTot slot[,.]?\s*/gi, "", "verwijderd 'Tot slot'"],
    [/\bSamenvattend[,.]?\s*/gi, "", "verwijderd 'Samenvattend'"],
    [/\bKort samengevat[,.]?\s*/gi, "", "verwijderd 'Kort samengevat'"],
    [/\bMet andere woorden[,.]?\s*/gi, "", "verwijderd 'Met andere woorden'"],
    [/\bIn een notendop[,.]?\s*/gi, "", "verwijderd 'In een notendop'"],
  ]},
  { cat: "Generieke eindes", color: "#c0392b", level: 2, rules: [
    [/\bDe toekomst ziet er (?:rooskleurig|veelbelovend) uit[.!]?\s*/gi, "", "verwijderd generiek einde"],
    [/\bDe mogelijkheden zijn eindeloos[.!]?\s*/gi, "", "verwijderd generiek einde"],
    [/\bAlleen de tijd zal het leren[.!]?\s*/gi, "", "verwijderd generiek einde"],
    [/\bDit is nog maar het begin[.!]?\s*/gi, "", "verwijderd generiek einde"],
    [/\bDe beste tijd komt nog[.!]?\s*/gi, "", "verwijderd generiek einde"],
    [/\bDe reis gaat door[.!]?\s*/gi, "", "verwijderd generiek einde"],
  ]},
  { cat: "Opgeblazen belang", color: "#8e44ad", level: 2, rules: [
    [/\bbaanbrekend\b/gi, "nieuw", "baanbrekend → nieuw"],
    [/\brevolutionair\b/gi, "nieuw", "revolutionair → nieuw"],
    [/\bpivotale rol\b/gi, "rol", "verwijderd 'pivotale'"],
    [/\bcruciale rol\b/gi, "rol", "verwijderd 'cruciale'"],
    [/\bvitale rol\b/gi, "rol", "verwijderd 'vitale'"],
    [/\bmonumentaal\b/gi, "groot", "monumentaal → groot"],
    [/\bhistorische mijlpaal\b/gi, "mijlpaal", "verwijderd 'historische'"],
    [/\bbepalend moment\b/gi, "keerpunt", "vereenvoudigd"],
    [/\bonderstreept (?:het |de )?belang\b/gi, "toont het belang", "vereenvoudigd"],
    [/\bhet evoluerende landschap van\b/gi, "het veld van", "vereenvoudigd"],
  ]},
  { cat: "Promotionele taal", color: "#16a085", level: 2, rules: [
    [/\bsynergie\b/gi, "samenwerking", "synergie → samenwerking"],
    [/\binnovatief\b/gi, "nieuw", "innovatief → nieuw"],
    [/\bdisruptief\b/gi, "nieuw", "disruptief → nieuw"],
    [/\bnaadloos\b/gi, "soepel", "naadloos → soepel"],
    [/\brobust\b/gi, "sterk", "robust → sterk"],
    [/\bparadigmaverschuiving\b/gi, "grote verandering", "vereenvoudigd"],
    [/\bholistische aanpak\b/gi, "complete aanpak", "vereenvoudigd"],
    [/\bholistisch\b/gi, "grondig", "holistisch → grondig"],
    [/\bgeavanceerd\b/gi, "nieuw", "geavanceerd → nieuw"],
    [/\bwereldklasse\b/gi, "", "verwijderd 'wereldklasse'"],
    [/\bgestroomlijnd\b/gi, "vereenvoudigd", "gestroomlijnd → vereenvoudigd"],
    [/\bversterkt\b/gi, "geholpen", "versterkt → geholpen"],
  ]},
  { cat: "AI woordenschat", color: "#c0392b", level: 2, rules: [
    [/\boptimaliseer(?:t|de|n)?\b/gi, "verbeter", "optimaliseren → verbeteren"],
    [/\boptimalisering\b/gi, "verbetering", "optimalisering → verbetering"],
    [/\bfaciliteer(?:t|de|n)?\b/gi, "help", "faciliteren → helpen"],
    [/\bfaciliteerde\b/gi, "hielp", "faciliteerde → hielp"],
    [/\butiliseer(?:t|de|n)?\b/gi, "gebruik", "utiliseren → gebruiken"],
    [/\bveelzijdig\b/gi, "complex", "veelzijdig → complex"],
    [/\buitgebreid overzicht\b/gi, "overzicht", "vereenvoudigd"],
    [/\buitgebreid\b/gi, "grondig", "uitgebreid → grondig"],
    [/\bpijnpunten?\b/gi, "problemen", "pijnpunten → problemen"],
    [/\bwaardepropositie\b/gi, "waarde", "waardepropositie → waarde"],
    [/\bthoughtleader(?:ship)?\b/gi, "expertise", "vereenvoudigd"],
    [/\becosysteem\b(?! (?:van dieren|herstel))/gi, "omgeving", "ecosysteem → omgeving"],
    [/\bdiep duiken in\b/gi, "nader bekijken", "diep duiken → nader bekijken"],
    [/\bbeste praktijken?\b/gi, "goede aanpak", "beste praktijken → goede aanpak"],
    [/\baantoonbaar\b/gi, "toont", "aantoonbaar → toont"],
    [/\bversterken\b/gi, "verbeteren", "versterken → verbeteren"],
    [/\bbevorderen\b/gi, "ondersteunen", "bevorderen → ondersteunen"],
  ]},
  { cat: "Overdreven voorzichtigheid", color: "#7f8c8d", level: 3, rules: [
    [/\bhet kan worden betoogd dat\s*/gi, "", "verwijderd omhaal"],
    [/\bmen zou kunnen stellen dat\s*/gi, "", "verwijderd omhaal"],
    [/\bpotentieel\b/gi, "mogelijk", "potentieel → mogelijk"],
    [/\bin bepaalde gevallen[,.]?\s*/gi, "soms", "vereenvoudigd"],
    [/\bonder bepaalde omstandigheden\b/gi, "soms", "vereenvoudigd"],
    [/\bin zekere mate\b/gi, "enigszins", "vereenvoudigd"],
    [/\bhet lijkt erop dat\s*/gi, "", "verwijderd omhaal"],
    [/\bhet is vermeldenswaard dat\s*/gi, "", "verwijderd opvulfrase"],
  ]},
  { cat: "Omslachtige zinnen", color: "#2c3e50", level: 2, rules: [
    [/\bvanwege het feit dat\b/gi, "omdat", "vereenvoudigd"],
    [/\bmet betrekking tot\b/gi, "over", "met betrekking tot → over"],
    [/\bten aanzien van\b/gi, "over", "ten aanzien van → over"],
    [/\bmet het oog op\b/gi, "voor", "vereenvoudigd"],
    [/\bin het kader van\b/gi, "bij", "vereenvoudigd"],
    [/\bvóór\b(?= het)/gi, "voor", "vóór → voor"],
    [/\bnaar aanleiding van\b/gi, "door", "vereenvoudigd"],
    [/\bde mogelijkheid hebben om\b/gi, "kunnen", "vereenvoudigd"],
    [/\bin staat zijn om\b/gi, "kunnen", "in staat zijn om → kunnen"],
    [/\bhet merendeel van\b/gi, "de meeste", "vereenvoudigd"],
    [/\been groot aantal van\b/gi, "veel", "vereenvoudigd"],
    [/\bop dit moment\b/gi, "nu", "op dit moment → nu"],
    [/\bin de nabije toekomst\b/gi, "binnenkort", "vereenvoudigd"],
    [/\bgebruik maken van\b/gi, "gebruiken", "vereenvoudigd"],
  ]},
  { cat: "Academisch formalisme", color: "#3498db", level: 2, rules: [
    [/\bBovendien[,.]?\s*/gi, "Ook, ", "Bovendien → Ook"],
    [/\bVoorts[,.]?\s*/gi, "Ook, ", "Voorts → Ook"],
    [/\bTevens[,.]?\s*/gi, "Ook, ", "Tevens → Ook"],
    [/\bNietttemin[,.]?\s*/gi, "Toch, ", "Nichttemin → Toch"],
    [/\bNietteemin[,.]?\s*/gi, "Toch, ", "Nichttemin → Toch"],
    [/\bNiettemin[,.]?\s*/gi, "Toch, ", "Niettemin → Toch"],
    [/\bDerhalve[,.]?\s*/gi, "Dus, ", "Derhalve → Dus"],
    [/\bAldus[,.]?\s*/gi, "Zo, ", "Aldus → Zo"],
    [/\bNochtans[,.]?\s*/gi, "Toch, ", "Nochtans → Toch"],
    [/\bd\.w\.z\.?,?\s*/gi, "dat wil zeggen, ", "d.w.z. → dat wil zeggen"],
    [/\bbijv\.?,?\s*/gi, "bijvoorbeeld, ", "bijv. → bijvoorbeeld"],
    [/\bde voornoemde\b/gi, "de bovengenoemde", "voornoemde → bovengenoemde"],
    [/\bmethodologie\b/gi, "methode", "methodologie → methode"],
    [/\bconceptualiseer(?:t|de|n)?\b/gi, "denk aan", "vereenvoudigd"],
    [/\boperationaliseer(?:t|de|n)?\b/gi, "pas toe", "vereenvoudigd"],
    [/\bgebaseerd op de premisse dat\b/gi, "gebaseerd op", "vereenvoudigd"],
    [/\bwordt gedefinieerd als\b/gi, "betekent", "wordt gedefinieerd als → betekent"],
    [/\bwordt gekenmerkt door\b/gi, "heeft", "vereenvoudigd"],
    [/\bwordt beschreven als\b/gi, "heet", "vereenvoudigd"],
    [/\bals tegenstelling tot\b/gi, "in plaats van", "vereenvoudigd"],
    [/\bin tegenstelling tot\b/gi, "anders dan", "vereenvoudigd"],
    [/\bvervolgens[,.]?\s*/gi, "daarna, ", "vervolgens → daarna"],
    [/\bdientengevolge[,.]?\s*/gi, "dus, ", "dientengevolge → dus"],
    [/\bdienovereenkomstig[,.]?\s*/gi, "dus, ", "vereenvoudigd"],
    [/\btegelijkertijd\b/gi, "tegelijk", "tegelijkertijd → tegelijk"],
    [/\bondanks het feit dat\b/gi, "ook al", "vereenvoudigd"],
    [/\bnegatieve gevolgen?\b/gi, "slechte uitkomsten", "vereenvoudigd"],
    [/\bemotieregulatie\b/gi, "het beheersen van emoties", "vereenvoudigd"],
  ]},

  { cat: "Bijwoordinflatie", color: "#9b59b6", level: 2, rules: [
    [/\binherent\b/gi, "", "verwijderd 'inherent'"],
    [/\boverheersend\b/gi, "grotendeels", "overheersend → grotendeels"],
    [/\bschijnbaar\b/gi, "blijkbaar", "schijnbaar → blijkbaar"],
    [/\bopvallend\b/gi, "", "verwijderd 'opvallend'"],
    [/\bmerkbaar\b/gi, "duidelijk", "merkbaar → duidelijk"],
    [/\bin wezen\b/gi, "eigenlijk", "in wezen → eigenlijk"],
    [/\buiteindelijk[,.]?\s*/gi, "", "verwijderd 'uiteindelijk'"],
    [/\bsystematisch\b/gi, "regelmatig", "systematisch → regelmatig"],
    [/\baanzienlijk\b/gi, "erg", "aanzienlijk → erg"],
    [/\bopvallend genoeg\b/gi, "", "verwijderd opvulfrase"],
    [/\bonmiskenbaar\b/gi, "duidelijk", "onmiskenbaar → duidelijk"],
    [/\bontegenzeggelijk\b/gi, "duidelijk", "ontegenzeggelijk → duidelijk"],
    [/\bonontkoombaar\b/gi, "altijd", "onontkoombaar → altijd"],
    [/\bwerkelijk\b/gi, "", "verwijderd 'werkelijk'"],
    [/\bzonder twijfel\b/gi, "duidelijk", "zonder twijfel → duidelijk"],
    [/\bprecies\b/gi, "exact", "precies → exact"],
  ]},
];

// ─────────────────────────────────────────────────────────────────────────────
// RULES — FRENCH (FR)
// ─────────────────────────────────────────────────────────────────────────────

const RULES_FR: RuleGroup[] = [
  { cat: "Mise en forme", color: "#7f8c8d", level: 1, rules: [
    [/"|"/g, '"', "guillemets droits"],
    [/'|'/g, "'", "apostrophes droites"],
    [/\s*—\s*/g, ", ", "tiret cadratin → virgule"],
    [/\*\*([^*]+)\*\*/g, "$1", "gras supprimé"],
    [/^\s*[🚀💡✅🎯🔑⚡🌟💎🔥👉📌📊🎉]+\s*/gm, "", "emojis supprimés"],
  ]},
  { cat: "Expressions de chatbot", color: "#e74c3c", level: 1, rules: [
    [/\bBonne question[!.]?\s*/gi, "", "supprimé 'Bonne question!'"],
    [/\bCertainement[!,]?\s*/gi, "", "supprimé 'Certainement!'"],
    [/\bBien s[uû]r[!,]?\s*/gi, "", "supprimé 'Bien sûr!'"],
    [/\bAbsolument[!,]?\s*/gi, "", "supprimé 'Absolument!'"],
    [/\bAvec plaisir[.!]?\s*/gi, "", "supprimé 'Avec plaisir'"],
    [/\bJe suis l[àa] pour (?:vous |t')aider[.!]?\s*/gi, "", "supprimé phrase chatbot"],
    [/\bEn tant qu'IA(?:\s+linguistique)?,?\s*/gi, "", "supprimé auto-référence IA"],
    [/\bJ'esp[eè]re que (?:cela|ça) (?:vous aide|répond)[^.]*\.\s*/gi, "", "supprimé 'J'espère que'"],
    [/\bN'h[eé]sitez pas [àa][^.]*\.\s*/gi, "", "supprimé 'N'hésitez pas à'"],
    [/\bFaites[- ]moi savoir si[^.]*\.\s*/gi, "", "supprimé offre chatbot"],
    [/\bComme demand[eé][,.]?\s*/gi, "", "supprimé 'Comme demandé'"],
    [/\bPour r[eé]pondre [àa] votre (?:question|demande)[,.]?\s*/gi, "", "supprimé ouverture chatbot"],
    [/\bJe vous remercie pour votre (?:question|message)[,.]?\s*/gi, "", "supprimé formule chatbot"],
  ]},
  { cat: "Avertissements de connaissances", color: "#95a5a6", level: 1, rules: [
    [/\bEn fonction des informations (?:actuellement )?disponibles[,.]?\s*/gi, "", "supprimé avertissement"],
    [/\bSelon mes derni[eè]res (?:données|connaissances)[^,.]*/gi, "", "supprimé référence formation"],
    [/\b[àA] l'(?:heure|moment) de la r[eé]daction[,.]?\s*/gi, "", "supprimé formule temporelle"],
    [/\bJusqu'[àa] la date de ma derni[eè]re mise [àa] jour[^,.]*/gi, "", "supprimé limite temporelle"],
  ]},
  { cat: "Ton complaisant", color: "#e67e22", level: 1, rules: [
    [/\bVous avez tout [àa] fait raison[.!,]?\s*/gi, "", "supprimé flatterie"],
    [/\bC'est une (?:excellente|bonne|superbe) (?:question|remarque)[.!,]?\s*/gi, "", "supprimé éloge vide"],
    [/\bExcellente (?:question|remarque)[.!,]?\s*/gi, "", "supprimé éloge vide"],
    [/\bJe suis ravi(?:e)? que vous (?:posiez|mentionniez) cette question[.!,]?\s*/gi, "", "supprimé flatterie"],
    [/\bQuelle (?:excellente|bonne|superbe) (?:question|idée)[.!,]?\s*/gi, "", "supprimé éloge vide"],
    [/\bJ'appr[eé]cie votre (?:question|perspicacité)[.!,]?\s*/gi, "", "supprimé flatterie"],
  ]},
  { cat: "Jalonnement", color: "#27ae60", level: 2, rules: [
    [/\bPlongeons[- ]nous dans[.!]?\s*/gi, "", "supprimé jalon"],
    [/\bExplorons\b[^.]*\.\s*/gi, "", "supprimé jalon"],
    [/\bD[eé]composons (?:cela|ceci)[.!]?\s*/gi, "", "supprimé jalon"],
    [/\bVoici ce que vous devez savoir[.:!]?\s*/gi, "", "supprimé jalon"],
    [/\bSans plus tarder[,.]?\s*/gi, "", "supprimé 'Sans plus tarder'"],
    [/\bJe vais vous guider [àa] travers\b\s*/gi, "", "supprimé jalon"],
    [/\bDans cet (?:article|guide|aperçu)[^.]*\.\s*/gi, "", "supprimé méta-intro"],
    [/\bAvant de (?:plonger|commencer)[^,]*,\s*/gi, "", "supprimé jalon"],
    [/\bCela [eé]tant dit[,.]?\s*/gi, "", "supprimé jalon"],
  ]},
  { cat: "Phrases de remplissage", color: "#2980b9", level: 2, rules: [
    [/\bDans le monde (?:actuel|d'aujourd'hui)[,.]?\s*/gi, "", "supprimé phrase de remplissage"],
    [/\b[àA] l'[eè]re (?:num[eé]rique|moderne|actuelle)[,.]?\s*/gi, "", "supprimé phrase de remplissage"],
    [/\bDans le domaine de\b\s*/gi, "Dans ", "simplifié"],
    [/\bAu c[oœ]ur de\b\s*/gi, "Dans ", "simplifié"],
    [/\bAfin de\b/gi, "Pour", "Afin de → Pour"],
    [/\bIl est important de noter que\s*/gi, "", "supprimé remplissage"],
    [/\bIl convient de noter que\s*/gi, "", "supprimé remplissage"],
    [/\bIl va sans dire que\s*/gi, "", "supprimé remplissage"],
    [/\bPremièrement et avant tout[,.]?\s*/gi, "D'abord, ", "simplifié"],
    [/\bEn conclusion[,.]?\s*/gi, "", "supprimé 'En conclusion'"],
    [/\bEn r[eé]sum[eé][,.]?\s*/gi, "", "supprimé 'En résumé'"],
    [/\bPour r[eé]sumer[,.]?\s*/gi, "", "supprimé 'Pour résumer'"],
    [/\bEn bref[,.]?\s*/gi, "", "supprimé 'En bref'"],
    [/\bAutrement dit[,.]?\s*/gi, "", "supprimé 'Autrement dit'"],
    [/\bEn d'autres termes[,.]?\s*/gi, "", "supprimé remplissage"],
    [/\bTout bien consid[eé]r[eé][,.]?\s*/gi, "", "supprimé remplissage"],
  ]},
  { cat: "Conclusions génériques", color: "#c0392b", level: 2, rules: [
    [/\bL'avenir s'annonce (?:radieux|prometteur)[.!]?\s*/gi, "", "supprimé conclusion générique"],
    [/\bLes possibilités sont infinies[.!]?\s*/gi, "", "supprimé conclusion générique"],
    [/\bSeul l'avenir nous le dira[.!]?\s*/gi, "", "supprimé conclusion générique"],
    [/\bCeci n'est que le d[eé]but[.!]?\s*/gi, "", "supprimé conclusion générique"],
    [/\bLe meilleur reste [àa] venir[.!]?\s*/gi, "", "supprimé conclusion générique"],
    [/\bLe voyage continue[.!]?\s*/gi, "", "supprimé conclusion générique"],
  ]},
  { cat: "Inflation de l'importance", color: "#8e44ad", level: 2, rules: [
    [/\br[eé]volutionnaire\b/gi, "nouveau", "révolutionnaire → nouveau"],
    [/\bnovateur\b/gi, "nouveau", "novateur → nouveau"],
    [/\bpivortal\b/gi, "clé", "pivotal → clé"],
    [/\bmonumental\b/gi, "grand", "monumental → grand"],
    [/\bjallon historique\b/gi, "étape", "simplifié"],
    [/\bmoment charnière\b/gi, "tournant", "simplifié"],
    [/\bpaysage en [eé]volution\b/gi, "domaine", "simplifié"],
    [/\bsouligne l'importance\b/gi, "montre l'importance", "simplifié"],
    [/\brôle (?:crucial|vital|pivotal)\b/gi, "rôle", "supprimé adjectif"],
  ]},
  { cat: "Langage promotionnel", color: "#16a085", level: 2, rules: [
    [/\bsynergie\b/gi, "coopération", "synergie → coopération"],
    [/\binnovant\b/gi, "nouveau", "innovant → nouveau"],
    [/\bdisruptif\b/gi, "nouveau", "disruptif → nouveau"],
    [/\btransformateur\b/gi, "important", "transformateur → important"],
    [/\bfluide\b(?= (?:exp[eé]rience|interface|processus))/gi, "simple", "fluide → simple"],
    [/\brobuste\b/gi, "solide", "robuste → solide"],
    [/\bchangement de paradigme\b/gi, "grand changement", "simplifié"],
    [/\bapproche holistique\b/gi, "approche complète", "simplifié"],
    [/\bholistique\b/gi, "complet", "holistique → complet"],
    [/\bde classe mondiale\b/gi, "", "supprimé 'de classe mondiale'"],
    [/\bincontournable\b/gi, "utile", "incontournable → utile"],
    [/\boptimis[eé]\b/gi, "amélioré", "optimisé → amélioré"],
  ]},
  { cat: "Vocabulaire IA", color: "#c0392b", level: 2, rules: [
    [/\boptimis(?:er|e|ons|ez)\b/gi, "améliorer", "optimiser → améliorer"],
    [/\boptimisation\b/gi, "amélioration", "optimisation → amélioration"],
    [/\bfacilit(?:er|e|ons|ez)\b/gi, "aider", "faciliter → aider"],
    [/\buttilis(?:er|e|ons|ez)\b/gi, "utiliser", "simplifié"],
    [/\bnutancer\b/gi, "préciser", "nuancer → préciser"],
    [/\bnuanc[eé]\b/gi, "complexe", "nuancé → complexe"],
    [/\bmultifacette\b/gi, "complexe", "multifacette → complexe"],
    [/\baperçu complet\b/gi, "aperçu", "simplifié"],
    [/\bcomplet\b(?= (?:guide|aperçu|analyse))/gi, "détaillé", "complet → détaillé"],
    [/\bpoints de douleur\b/gi, "problèmes", "points de douleur → problèmes"],
    [/\bproposition de valeur\b/gi, "valeur", "simplifié"],
    [/\bleadership [eé]clair[eé]\b/gi, "expertise", "simplifié"],
    [/\b[eé]cosyst[eè]me\b(?! (?:animal|naturel|marin))/gi, "environnement", "simplifié"],
    [/\bplonger dans\b/gi, "examiner", "plonger dans → examiner"],
    [/\bbonnes pratiques?\b/gi, "bonne approche", "simplifié"],
    [/\bmet en [eé]vidence\b/gi, "montre", "simplifié"],
    [/\brenforcent?\b/gi, "améliorent", "renforce → améliore"],
    [/\bfavoris(?:er|e|ons|ez)\b/gi, "encourager", "favoriser → encourager"],
  ]},
  { cat: "Précautions excessives", color: "#7f8c8d", level: 3, rules: [
    [/\bon pourrait soutenir que\s*/gi, "", "supprimé précaution"],
    [/\bcertains pourraient dire que\s*/gi, "", "supprimé précaution"],
    [/\bpotentiellement\b/gi, "peut-être", "potentiellement → peut-être"],
    [/\bdans certains cas[,.]?\s*/gi, "parfois", "simplifié"],
    [/\bselon les circonstances\b/gi, "parfois", "simplifié"],
    [/\bdans une certaine mesure\b/gi, "en partie", "simplifié"],
    [/\bil semblerait que\s*/gi, "", "supprimé précaution"],
    [/\bil convient de mentionner que\s*/gi, "", "supprimé remplissage"],
  ]},
  { cat: "Phrases verbeuses", color: "#2c3e50", level: 2, rules: [
    [/\ben raison du fait que\b/gi, "parce que", "simplifié"],
    [/\bà la lumi[eè]re du fait que\b/gi, "parce que", "simplifié"],
    [/\bdans le but de\b/gi, "pour", "simplifié"],
    [/\ben ce qui concerne\b/gi, "sur", "simplifié"],
    [/\bsur la base de\b/gi, "selon", "simplifié"],
    [/\bpr[eé]alablement [àa]\b/gi, "avant", "simplifié"],
    [/\bult[eé]rieurement [àa]\b/gi, "après", "simplifié"],
    [/\bdans l'[eé]ventualit[eé] o[uù]\b/gi, "si", "simplifié"],
    [/\bun grand nombre de\b/gi, "beaucoup de", "simplifié"],
    [/\bla grande majorit[eé] de\b/gi, "la plupart de", "simplifié"],
    [/\bde mani[eè]re r[eé]guli[eè]re\b/gi, "régulièrement", "simplifié"],
    [/\bà ce stade\b/gi, "maintenant", "simplifié"],
    [/\bdans un avenir proche\b/gi, "bientôt", "simplifié"],
    [/\bprendre une d[eé]cision\b/gi, "décider", "simplifié"],
    [/\bavoir la capacit[eé] de\b/gi, "pouvoir", "simplifié"],
    [/\bêtre en mesure de\b/gi, "pouvoir", "simplifié"],
    [/\bfaire usage de\b/gi, "utiliser", "simplifié"],
    [/\bdu point de vue de\b/gi, "pour", "simplifié"],
    [/\ben termes de\b/gi, "pour", "simplifié"],
  ]},
  { cat: "Formalité académique", color: "#3498db", level: 2, rules: [
    [/\bDe plus[,.]?\s*/gi, "Aussi, ", "De plus → Aussi"],
    [/\bEn outre[,.]?\s*/gi, "Aussi, ", "En outre → Aussi"],
    [/\bN[eé]anmoins[,.]?\s*/gi, "Pourtant, ", "Néanmoins → Pourtant"],
    [/\bToutefois[,.]?\s*/gi, "Mais, ", "Toutefois → Mais"],
    [/\bCependant[,.]?\s*/gi, "Mais, ", "Cependant → Mais"],
    [/\bAinsi[,.]?\s*/gi, "Donc, ", "Ainsi → Donc"],
    [/\bPar cons[eé]quent[,.]?\s*/gi, "Donc, ", "Par conséquent → Donc"],
    [/\bc\.-[àa]-d\.?,?\s*/gi, "c'est-à-dire, ", "c.-à-d. → c'est-à-dire"],
    [/\bp\. ex\.?,?\s*/gi, "par exemple, ", "p. ex. → par exemple"],
    [/\bm[eé]thodologie\b/gi, "méthode", "méthodologie → méthode"],
    [/\bconceptualiser?\b/gi, "concevoir", "conceptualiser → concevoir"],
    [/\bop[eé]rationnaliser?\b/gi, "appliquer", "opérationnaliser → appliquer"],
    [/\bledit(?:e)?\b/gi, "le/la", "ledit → le"],
    [/\bsusmentionn[eé](?:e)?\b/gi, "ci-dessus", "susmentionné → ci-dessus"],
    [/\bdans la mesure o[uù]\b/gi, "dans la mesure où", "simplifié"],
    [/\b[àA] cet [eé]gard[,.]?\s*/gi, "À ce sujet, ", "simplifié"],
    [/\best d[eé]fini(?:e)? (?:comme|par)\b/gi, "signifie", "est défini comme → signifie"],
    [/\best caract[eé]ris[eé](?:e)? par\b/gi, "a", "simplifié"],
    [/\best d[eé]crit(?:e)? comme\b/gi, "est appelé", "simplifié"],
    [/\bpar opposition [àa]\b/gi, "plutôt que", "simplifié"],
    [/\bpar contraste avec\b/gi, "contrairement à", "simplifié"],
    [/\bpar comparaison avec\b/gi, "comparé à", "simplifié"],
    [/\bpar la suite[,.]?\s*/gi, "ensuite, ", "par la suite → ensuite"],
    [/\bpar cons[eé]quent[,.]?\s*/gi, "donc, ", "par conséquent → donc"],
    [/\bsimultan[eé]ment\b/gi, "en même temps", "simultanément → en même temps"],
    [/\bmalgr[eé] le fait que\b/gi, "même si", "malgré le fait que → même si"],
    [/\bcons[eé]quences n[eé]gatives?\b/gi, "mauvais résultats", "simplifié"],
    [/\br[eé]gulation [eé]motionnelle\b/gi, "gestion des émotions", "simplifié"],
    [/\bgestion du temps\b/gi, "organisation du temps", "simplifié"],
  ]},

  { cat: "Inflation des adverbes", color: "#9b59b6", level: 2, rules: [
    [/\binh[eé]rent(?:e|ment)?\b/gi, "", "supprimé 'inhérent'"],
    [/\bprincipalem[eé]nt\b/gi, "surtout", "principalement → surtout"],
    [/\bostensiblement\b/gi, "apparemment", "ostensiblement → apparemment"],
    [/\bnotamment\b/gi, "", "supprimé 'notamment'"],
    [/\bmarquament\b/gi, "nettement", "marquament → nettement"],
    [/\bessentiellement\b/gi, "en gros", "essentiellement → en gros"],
    [/\bfinalement[,.]?\s*/gi, "", "supprimé 'finalement'"],
    [/\bsyst[eé]matiquement\b/gi, "régulièrement", "systématiquement → régulièrement"],
    [/\bsubstantiellement\b/gi, "grandement", "substantiellement → grandement"],
    [/\bconsid[eé]rablement\b/gi, "grandement", "considérablement → grandement"],
    [/\bremarkablement\b/gi, "très", "remarquablement → très"],
    [/\btextuellement\b/gi, "mot pour mot", "textuellement → mot pour mot"],
    [/\bindéniablement\b/gi, "clairement", "indéniablement → clairement"],
    [/\bin[eé]vitablement\b/gi, "toujours", "inévitablement → toujours"],
    [/\bvraisemblablement\b/gi, "probablement", "vraisemblablement → probablement"],
    [/\bradicalement\b/gi, "grandement", "radicalement → grandement"],
    [/\bprofond[eé]ment\b/gi, "très", "profondément → très"],
    [/\bpr[eé]cis[eé]ment\b/gi, "exactement", "précisément → exactement"],
  ]},
];

// ─────────────────────────────────────────────────────────────────────────────
// RULE LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

const ALL_RULES: Record<Lang, RuleGroup[]> = {
  en: RULES_EN,
  nl: RULES_NL,
  fr: RULES_FR,
};

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function applyRules(text: string, intensity: Intensity, enabled: Set<string>, rules: RuleGroup[]): { text: string; changes: Change[] } {
  let result = text;
  const changes: Change[] = [];
  for (const group of rules) {
    if (group.level > intensity || !enabled.has(group.cat)) continue;
    for (const [pattern, replacement, label] of group.rules) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      result = result.replace(regex, (matched: string, ...args: unknown[]) => {
        let rep = replacement;
        rep = rep.replace(/\$(\d+)/g, (_: string, n: string) => String(args[parseInt(n) - 1] ?? ""));
        if (matched.trim() !== rep.trim())
          changes.push({ cat: group.cat, color: group.color, original: matched.trim(), replacement: rep.trim(), label });
        return rep;
      });
    }
  }
  result = result
    .replace(/[ \t]{2,}/g, " ").replace(/ ([,.:;!?])/g, "$1")
    .replace(/([,.:;!?]){2,}/g, "$1").replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  return { text: result, changes };
}

function applyRulesHighlighted(text: string, intensity: Intensity, enabled: Set<string>, rules: RuleGroup[]): string {
  let result = text;
  for (const group of rules) {
    if (group.level > intensity || !enabled.has(group.cat)) continue;
    for (const [pattern, replacement] of group.rules) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      result = result.replace(regex, (matched: string, ...args: unknown[]) => {
        let rep = replacement;
        rep = rep.replace(/\$(\d+)/g, (_: string, n: string) => String(args[parseInt(n) - 1] ?? ""));
        if (rep.trim() === "") return "";
        if (matched.trim().toLowerCase() === rep.trim().toLowerCase()) return rep;
        return `⟦${rep}⟧`;
      });
    }
  }
  return result.replace(/[ \t]{2,}/g, " ").replace(/ ([,.:;!?])/g, "$1").trim();
}

function countPatterns(text: string, intensity: Intensity, enabled: Set<string>, rules: RuleGroup[]): number {
  let n = 0;
  for (const group of rules) {
    if (group.level > intensity || !enabled.has(group.cat)) continue;
    for (const [pattern] of group.rules) {
      const m = text.match(pattern);
      if (m) n += m.length;
    }
  }
  return n;
}

function groupChanges(changes: Change[]): GroupedChanges {
  const map: GroupedChanges = {};
  for (const c of changes) {
    if (!map[c.cat]) map[c.cat] = { color: c.color, items: [] };
    map[c.cat].items.push(c);
  }
  return map;
}

function calcAiScore(patterns: number, words: number): number {
  if (words === 0) return 0;
  return Math.round(Math.min(100, (patterns / words) * 220));
}

function scoreInfo(s: number, lang: Lang): { color: string; label: string } {
  const labels = UI[lang].scoreLabels;
  if (s < 20) return { color: "#27ae60", label: labels[0] };
  if (s < 45) return { color: "#2ecc71", label: labels[1] };
  if (s < 65) return { color: "#e67e22", label: labels[2] };
  if (s < 82) return { color: "#e74c3c", label: labels[3] };
  return { color: "#c0392b", label: labels[4] };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 650 }: { value: number; duration?: number }) {
  const [disp, setDisp] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisp(Math.round(ease * value));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <>{disp}</>;
}

function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/);
  return <>{parts.map((p: string, i: number) =>
    p.startsWith("⟦") ? (
      <span key={i} style={{ background: "#1a3a1a", color: "#7ecb7e", borderRadius: "2px", padding: "0 2px" }}>
        {p.slice(1, -1)}
      </span>
    ) : p
  )}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg: "#0f0e0c", surface: "#191815", border: "#272520",
  text: "#e8e0cc", muted: "#7a7060", dim: "#444038",
  red: "#c0392b", redSurface: "#160c0b", redBorder: "#3d1512",
  mono: "'JetBrains Mono','Fira Code',monospace",
  serif: "'Playfair Display',Georgia,serif",
};

const LANG_LABELS: Record<Lang, string> = { en: "EN", nl: "NL", fr: "FR" };

export default function Humanizer() {
  const [lang, setLang] = useState<Lang>("en");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<HumanizerResult | null>(null);
  const [tab, setTab] = useState("final");
  const [copied, setCopied] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [enabledCats, setEnabledCats] = useState<Set<string>>(() => new Set(RULES_EN.map(r => r.cat)));
  const [showCats, setShowCats] = useState(false);

  const ui = UI[lang];
  const rules = ALL_RULES[lang];

  // Reset when language changes
  useEffect(() => {
    setResult(null);
    setEnabledCats(new Set(ALL_RULES[lang].map(r => r.cat)));
    setTab("final");
  }, [lang]);

  const wc = (t: string) => t.trim() ? t.trim().split(/\s+/).length : 0;

  const liveScore = useMemo(() => {
    if (!input.trim()) return null;
    return calcAiScore(countPatterns(input, intensity, enabledCats, rules), wc(input));
  }, [input, intensity, enabledCats, rules]);

  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@400;500&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      body{background:#0f0e0c}
      textarea{transition:border-color .2s}
      textarea:focus{outline:none;border-color:#c0392b!important}
      textarea::placeholder{color:#3a3830}
      .hbtn{transition:background .15s,opacity .15s}
      .hbtn:hover:not(:disabled){background:#a0301f!important}
      .hbtn:active:not(:disabled){transform:scale(.98)}
      .htab{transition:color .15s,border-color .15s}
      .htab:hover{color:#c8bfa8!important}
      .vcopy{transition:background .15s,color .15s,border-color .15s}
      .vcopy:hover{background:#222018!important}
      .int-btn{transition:background .15s,color .15s,border-color .15s}
      .int-btn:hover{border-color:#555!important}
      .lang-btn{transition:background .15s,color .15s,border-color .15s}
      .lang-btn:hover{border-color:#888!important}
      .cat-check{cursor:pointer;transition:opacity .15s}
      .cat-check:hover{opacity:.8}
      .tab-panel{animation:fadeIn .18s ease}
      .cat-panel{animation:slideDown .18s ease}
      @keyframes fadeIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
      @media(max-width:640px){
        .ba-grid{grid-template-columns:1fr!important}
        .stat-grid{grid-template-columns:1fr 1fr!important}
        .ctrl-row{flex-direction:column!important;align-items:flex-start!important;gap:.75rem!important}
        .cat-grid{grid-template-columns:1fr 1fr!important}
        .tab-bar{flex-wrap:wrap!important}
      }
    `;
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  const run = useCallback(() => {
    if (!input.trim()) return;
    const { text, changes } = applyRules(input, intensity, enabledCats, rules);
    const highlighted = applyRulesHighlighted(input, intensity, enabledCats, rules);
    const beforeCount = countPatterns(input, intensity, enabledCats, rules);
    const afterCount = countPatterns(text, intensity, enabledCats, rules);
    const aiScore = calcAiScore(beforeCount, wc(input));
    setResult({ text, highlighted, changes, beforeCount, afterCount, grouped: groupChanges(changes), aiScore });
    setTab(ui.tabs[0] === "Final" ? "final" : ui.tabs[0].toLowerCase());
  }, [input, intensity, enabledCats, rules, ui]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run]);

  const TAB_IDS = ["final", "changes", "stats"];

  function clear() { setInput(""); setResult(null); }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  }

  function copyDiff() {
    if (!result) return;
    navigator.clipboard.writeText(result.highlighted).then(() => {
      setCopiedDiff(true); setTimeout(() => setCopiedDiff(false), 1800);
    });
  }

  function toggleCat(cat: string) {
    setEnabledCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const enabledCount = enabledCats.size;
  const totalCats = rules.length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.mono, padding: "2.5rem 1.5rem 5rem" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{ display: "inline-block", position: "relative" }}>
          <div style={{ position: "absolute", top: "50%", left: "-2rem", right: "-2rem", height: "1px", background: C.border }} />
          <div style={{ fontFamily: C.serif, fontWeight: 700, fontSize: "clamp(2rem,5vw,3.4rem)", letterSpacing: "0.08em", color: C.text, lineHeight: 1, position: "relative", background: C.bg, padding: "0 1rem" }}>
            THE HUMANIZER
          </div>
        </div>
        <div style={{ marginTop: "0.7rem", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: C.red }}>
          {ui.tagline}
        </div>

        {/* Language switcher */}
        <div style={{ display: "flex", justifyContent: "center", gap: "0.3rem", marginTop: "1rem" }}>
          {(["en", "nl", "fr"] as Lang[]).map(l => (
            <button key={l} className="lang-btn" onClick={() => setLang(l)} style={{
              background: lang === l ? C.surface : "none",
              border: `1px solid ${lang === l ? C.muted : C.border}`,
              color: lang === l ? C.text : C.dim,
              fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.2em",
              padding: "0.25rem 0.55rem", cursor: "pointer", borderRadius: "2px",
            }}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* Live AI score bar */}
        {liveScore !== null && (() => {
          const { color, label } = scoreInfo(liveScore, lang);
          return (
            <div style={{ marginBottom: "1rem", padding: "0.6rem 0.875rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>{ui.aiSig}</span>
              <div style={{ flex: 1, height: "4px", background: C.border, borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ width: `${liveScore}%`, height: "100%", background: color, borderRadius: "2px", transition: "width .4s ease, background .4s ease" }} />
              </div>
              <span style={{ fontSize: "0.65rem", color, fontWeight: 500, minWidth: "2.5rem", textAlign: "right" }}>{liveScore}%</span>
              <span style={{ fontSize: "0.56rem", color: C.muted, letterSpacing: "0.1em" }}>{label}</span>
            </div>
          );
        })()}

        {/* Input */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>
            {ui.inputLabel}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={ui.placeholder}
            style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.mono, fontSize: "0.84rem", padding: "0.9rem 1rem", resize: "vertical", lineHeight: 1.8, borderRadius: "2px" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
            <span style={{ fontSize: "0.58rem", color: C.dim }}>{wc(input)} {ui.words} · {input.length} {ui.chars}</span>
            {input && (
              <button onClick={clear} style={{ background: "none", border: "none", color: C.dim, fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", padding: "0.2rem 0" }}>
                {ui.clear}
              </button>
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className="ctrl-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted }}>{ui.intensity}</span>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {([1, 2, 3] as Intensity[]).map(lvl => (
                <button key={lvl} className="int-btn" onClick={() => setIntensity(lvl)} style={{
                  background: intensity === lvl ? C.red : "none",
                  border: `1px solid ${intensity === lvl ? C.red : C.border}`,
                  color: intensity === lvl ? "#fff" : C.muted,
                  fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.15em",
                  textTransform: "uppercase", padding: "0.3rem 0.65rem",
                  cursor: "pointer", borderRadius: "2px",
                }}>
                  {ui.intensityLabels[lvl]}
                </button>
              ))}
            </div>
          </div>

          <button className="int-btn" onClick={() => setShowCats(v => !v)} style={{
            background: "none", border: `1px solid ${showCats ? C.red : C.border}`,
            color: showCats ? C.text : C.muted, fontFamily: C.mono,
            fontSize: "0.56rem", letterSpacing: "0.15em", textTransform: "uppercase",
            padding: "0.3rem 0.75rem", cursor: "pointer", borderRadius: "2px",
          }}>
            {enabledCount}/{totalCats} {ui.categories} {showCats ? "▲" : "▼"}
          </button>
        </div>

        {/* Category panel */}
        {showCats && (
          <div className="cat-panel" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted }}>{ui.toggleCats}</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => setEnabledCats(new Set(rules.map(r => r.cat)))} style={{ background: "none", border: "none", color: C.muted, fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer" }}>{ui.all}</button>
                <span style={{ color: C.dim }}>·</span>
                <button onClick={() => setEnabledCats(new Set())} style={{ background: "none", border: "none", color: C.muted, fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer" }}>{ui.none}</button>
              </div>
            </div>
            <div className="cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem 1rem" }}>
              {rules.map(({ cat, color, level }) => (
                <label key={cat} className="cat-check" style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={enabledCats.has(cat)} onChange={() => toggleCat(cat)}
                    style={{ accentColor: color, width: "11px", height: "11px", cursor: "pointer" }} />
                  <span style={{ fontSize: "0.64rem", color: enabledCats.has(cat) ? color : C.dim }}>{cat}</span>
                  <span style={{ fontSize: "0.5rem", color: C.dim, marginLeft: "auto" }}>L{level}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Humanize button */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "2.5rem", gap: "0.4rem" }}>
          <button className="hbtn" onClick={run} disabled={!input.trim()} style={{
            background: C.red, border: "none", color: "#fff", fontFamily: C.mono,
            fontSize: "0.68rem", letterSpacing: "0.3em", textTransform: "uppercase",
            padding: "0.9rem 2.75rem", cursor: !input.trim() ? "not-allowed" : "pointer",
            opacity: !input.trim() ? 0.3 : 1, borderRadius: "2px",
          }}>
            {ui.humanize}
          </button>
          <span style={{ fontSize: "0.52rem", color: C.dim, letterSpacing: "0.1em" }}>{ui.shortcut}</span>
        </div>

        {/* Results */}
        {result && (
          <div>
            <div style={{ height: "1px", background: C.border, marginBottom: "2rem" }} />

            {/* Tabs + copy buttons */}
            <div className="tab-bar" style={{ display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.border}`, marginBottom: "1.75rem", justifyContent: "space-between" }}>
              <div style={{ display: "flex" }}>
                {TAB_IDS.map((id, idx) => (
                  <button key={id} className="htab" onClick={() => setTab(id)} style={{
                    background: "none", border: "none",
                    borderBottom: tab === id ? `2px solid ${C.red}` : "2px solid transparent",
                    color: tab === id ? C.text : C.muted, fontFamily: C.mono,
                    fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase",
                    padding: "0.4rem 0.875rem 0.6rem", cursor: "pointer", marginBottom: "-1px",
                  }}>
                    {ui.tabs[idx]}{id === "changes" && result.changes.length > 0 ? ` (${result.changes.length})` : ""}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
                <button className="vcopy" onClick={copy} style={{
                  background: "none", border: `1px solid ${copied ? "#27ae60" : C.border}`,
                  color: copied ? "#6aaf6a" : C.muted, fontFamily: C.mono,
                  fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase",
                  padding: "0.3rem 0.65rem", cursor: "pointer", borderRadius: "2px",
                }}>
                  {copied ? ui.copied : ui.copy}
                </button>
                <button className="vcopy" onClick={copyDiff} style={{
                  background: "none", border: `1px solid ${copiedDiff ? "#27ae60" : C.border}`,
                  color: copiedDiff ? "#6aaf6a" : C.muted, fontFamily: C.mono,
                  fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase",
                  padding: "0.3rem 0.65rem", cursor: "pointer", borderRadius: "2px",
                }}>
                  {copiedDiff ? ui.copied : ui.copyDiff}
                </button>
              </div>
            </div>

            {/* Final tab */}
            {tab === "final" && (
              <div className="tab-panel ba-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.dim, marginBottom: "0.5rem" }}>{ui.before} · <span style={{ color: C.dim }}>{wc(input)} {ui.words}</span></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.8, color: "#5a5448", borderRadius: "2px", whiteSpace: "pre-wrap", minHeight: "180px", wordBreak: "break-word" }}>
                    {input}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.red, marginBottom: "0.5rem" }}>{ui.after} · <span style={{ color: C.muted }}>{wc(result.text)} {ui.words}</span></div>
                  <div style={{ background: C.redSurface, border: `1px solid ${C.redBorder}`, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.8, color: "#d8c8a8", borderRadius: "2px", whiteSpace: "pre-wrap", minHeight: "180px", wordBreak: "break-word" }}>
                    <HighlightedText text={result.highlighted} />
                  </div>
                </div>
              </div>
            )}

            {/* Changes tab */}
            {tab === "changes" && (
              <div className="tab-panel">
                {result.changes.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: "0.8rem", padding: "2rem", textAlign: "center" }}>{ui.noPatterns}</div>
                ) : (
                  Object.entries(result.grouped).map(([cat, { color, items }]) => (
                    <div key={cat} style={{ marginBottom: "1.5rem" }}>
                      <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color, marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: color }} />
                        {cat} <span style={{ color: C.dim }}>({items.length})</span>
                      </div>
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", overflow: "hidden" }}>
                        {items.map((item: Change, i: number) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none", fontSize: "0.75rem" }}>
                            <div style={{ padding: "0.5rem 0.75rem", color: "#5a5040", textDecoration: "line-through", wordBreak: "break-word", borderRight: `1px solid ${C.border}` }}>
                              {item.original || "(removed)"}
                            </div>
                            <div style={{ padding: "0.5rem 0.75rem", color: item.replacement ? "#7ecb7e" : C.dim, wordBreak: "break-word" }}>
                              {item.replacement || <em style={{ color: C.dim }}>deleted</em>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Stats tab */}
            {tab === "stats" && (() => {
              const beforeScore = result.aiScore;
              const afterScore = calcAiScore(result.afterCount, wc(result.text));
              const afterInfo = scoreInfo(afterScore, lang);
              const beforeInfo = scoreInfo(beforeScore, lang);
              return (
                <div className="tab-panel">
                  <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                    {[
                      { label: ui.patterns, val: result.changes.length, color: C.red },
                      { label: ui.words2, val: `${wc(input)}→${wc(result.text)}`, color: "#7ecb7e", isStr: true },
                      { label: ui.catFixed, val: Object.keys(result.grouped).length, color: "#7aadcb" },
                      { label: ui.aiScore, val: `${beforeScore}→${afterScore}%`, color: afterInfo.color, isStr: true },
                    ].map(({ label, val, color, isStr }) => (
                      <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem", borderRadius: "2px", textAlign: "center" }}>
                        <div style={{ fontSize: "0.52rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>{label}</div>
                        <div style={{ fontSize: isStr ? "1rem" : "1.4rem", fontWeight: 500, color }}>
                          {isStr ? val : <AnimatedNumber value={val as number} />}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: "1.75rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", padding: "1rem" }}>
                    <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.75rem" }}>{ui.sigComp}</div>
                    {[
                      { label: ui.before, score: beforeScore, info: beforeInfo },
                      { label: ui.after, score: afterScore, info: afterInfo },
                    ].map(({ label, score, info }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                        <span style={{ fontSize: "0.6rem", color: C.muted, minWidth: "2.5rem" }}>{label}</span>
                        <div style={{ flex: 1, height: "6px", background: C.border, borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${score}%`, height: "100%", background: info.color, borderRadius: "3px", transition: "width .6s ease" }} />
                        </div>
                        <span style={{ fontSize: "0.65rem", color: info.color, minWidth: "2.5rem" }}>{score}%</span>
                        <span style={{ fontSize: "0.56rem", color: C.muted, minWidth: "5rem" }}>{info.label}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.75rem" }}>
                    {ui.breakdown}
                  </div>
                  {Object.entries(result.grouped).sort((a, b) => b[1].items.length - a[1].items.length).map(([cat, { color, items }]) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                      <div style={{ flex: 1, fontSize: "0.72rem", color: C.text }}>{cat}</div>
                      <div style={{ width: `${Math.min(items.length / result.changes.length * 200, 140)}px`, height: "4px", background: color, borderRadius: "2px", minWidth: "4px" }} />
                      <div style={{ fontSize: "0.68rem", color, minWidth: "2rem", textAlign: "right" }}>
                        <AnimatedNumber value={items.length} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        <div style={{ marginTop: "4rem", textAlign: "center", fontSize: "0.52rem", letterSpacing: "0.15em", color: C.dim, textTransform: "uppercase" }}>
          {ui.footer}
        </div>

        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <a href="https://ngcodes.com" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", opacity: 0.75, transition: "opacity .2s" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.75")}>
            <img src="MadeByNGC.png" alt="Made by NGC — Ngcodes.com" style={{ maxHeight: "48px", width: "auto" }} />
          </a>
        </div>
      </div>
    </div>
  );
}
