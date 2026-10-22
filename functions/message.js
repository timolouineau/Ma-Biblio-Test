/* Texte des notifications envoyées sur les téléphones (séparé pour pouvoir le tester) */
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

// Texte de la notification selon son type (exporté pour les tests)
const buildPush = (n, notifId) => {
    const who = clip(n.user, 40) || "Quelqu'un";
    const work = clip(n.itemTitle, 80);
    const text = clip(n.text || n.message, 160);
    let title, body;
    switch (n.type) {
        case 'like': title = `${who} a aimé ton post`; body = work || 'Ouvre MaBiblio pour voir'; break;
        case 'like_comment': title = `${who} a aimé ton commentaire`; body = work ? `Sur ${work}` : ''; break;
        case 'comment': title = `${who} a commenté ton post`; body = work ? `Sur ${work}` : 'Ouvre MaBiblio pour lire'; break;
        case 'mention': title = `${who} t'a mentionné`; body = work ? `Dans un commentaire sur ${work}` : 'Dans un commentaire'; break;
        case 'reply': title = `${who} a répondu à ton commentaire`; body = work ? `Sur ${work}` : 'Ouvre MaBiblio pour lire'; break;
        case 'annonce': title = clip(n.title, 80) || 'Nouveautés sur MaBiblio'; body = text || 'Ouvre MaBiblio pour découvrir la nouvelle version'; break;
        case 'follow': title = `${who} s'est abonné à toi`; body = 'Découvre sa bibliothèque'; break;
        case 'reco': title = `${who} te conseille ${work || 'une œuvre'}`; body = clip(n.note, 160) ? `« ${clip(n.note, 160)} »` : 'Touche pour voir la fiche'; break;
        default: title = `${who}`; body = text || 'Nouvelle activité sur MaBiblio';
    }
    return { title: clip(title, 110), body: clip(body, 200) || 'MaBiblio', url: `./?notif=${notifId}`, tag: clip(notifId, 64) };
};

module.exports = { buildPush };
