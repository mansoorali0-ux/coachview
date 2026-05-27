const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

exports.handler = async function(event) {
  try {
    const token = event.headers['x-pitchside-admin'];

    if (token !== process.env.PITCHSIDE_ADMIN_TOKEN) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const snap = await db.collection('games').get();

    const games = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    games.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        count: games.length,
        games
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};