/* =====================================================================
   MABIBLIO — envoi des notifications sur les téléphones
   Dès qu'une notification est créée dans l'app (j'aime, commentaire, mention, abonnement, conseil),
   ce programme l'envoie sur les téléphones où le destinataire a activé les notifications.
   Il ne modifie JAMAIS les bibliothèques ni les posts : il lit le profil et les téléphones du
   destinataire, envoie, et supprime seulement les téléphones devenus invalides.
   ===================================================================== */
const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

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
        case 'follow': title = `${who} s'est abonné à toi`; body = 'Découvre sa bibliothèque'; break;
        case 'reco': title = `${who} te conseille ${work || 'une œuvre'}`; body = clip(n.note, 160) ? `« ${clip(n.note, 160)} »` : 'Touche pour voir la fiche'; break;
        default: title = `${who}`; body = text || 'Nouvelle activité sur MaBiblio';
    }
    return { title: clip(title, 110), body: clip(body, 200) || 'MaBiblio', url: `./?notif=${notifId}`, tag: clip(notifId, 64) };
};

exports.buildPush = buildPush;

exports.envoyerNotification = functions
    .region('europe-west1')
    .firestore.document('artifacts/{appId}/users/{uid}/notifications/{notifId}')
    .onCreate(async (snap, context) => {
        const n = snap.data() || {};
        const { appId, uid, notifId } = context.params;
        if (n.read || !n.fromUid || n.fromUid === uid) return null;
        const db = getFirestore();

        // Le destinataire a bloqué l'expéditeur : rien n'est envoyé
        const prof = (await db.doc(`artifacts/${appId}/users/${uid}/profile/info`).get()).data() || {};
        if (Array.isArray(prof.blocked) && prof.blocked.includes(n.fromUid)) return null;

        const devices = await db.collection(`artifacts/${appId}/users/${uid}/pushTokens`).get();
        if (devices.empty) return null;
        const tokens = devices.docs.map(d => d.get('token')).filter(t => typeof t === 'string' && t.length > 20);
        if (!tokens.length) return null;

        const data = buildPush(n, notifId);
        // Nombre de notifications non lues → pastille rouge sur l'icône de l'appli
        try {
            const unread = await db.collection(`artifacts/${appId}/users/${uid}/notifications`).where('read', '==', false).count().get();
            data.badge = String(Math.min(unread.data().count || 1, 99));
        } catch (e) { data.badge = '1'; }
        const res = await getMessaging().sendEachForMulticast({
            tokens,
            data,
            webpush: { headers: { Urgency: 'high', TTL: '86400' } }
        });

        // Téléphones désinstallés ou abonnements expirés : on les retire
        const dead = [];
        res.responses.forEach((r, k) => {
            const code = r.error && r.error.code;
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') dead.push(tokens[k]);
        });
        if (dead.length) {
            const batch = db.batch();
            devices.docs.filter(d => dead.includes(d.get('token'))).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        functions.logger.info(`Notification ${n.type} → ${res.successCount} envoyée(s), ${res.failureCount} échec(s)`);
        return null;
    });
