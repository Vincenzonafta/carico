// Il modello Gemini sta QUI e solo qui. Stava scritto in due file (chat e parser) e il
// 20 lug si erano sfasati: la chat su 2.5 e il parser ancora su 3.5, quindi l'import
// falliva mentre la chat rispondeva. Un posto solo, e non può succedere di nuovo.
// 2.5: il 3.5 dava "high demand" (503, sovraccarico lato Google) di continuo, anche su "ciao".
// Il 2.5 è più scarico e girava già bene. Tornare al 3.5 quando la congestione passa = una riga.
export const MODEL = 'gemini-2.5-flash'
