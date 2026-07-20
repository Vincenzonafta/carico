// Il modello Gemini sta QUI e solo qui. Stava scritto in due file (chat e parser) e il
// 20 lug si erano sfasati: la chat su 2.5 e il parser ancora su 3.5, quindi l'import
// falliva mentre la chat rispondeva. Un posto solo, e non può succedere di nuovo.
export const MODEL = 'gemini-2.5-flash'
