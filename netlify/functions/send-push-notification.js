const crypto = require('crypto')

const DEFAULT_PROJECT_ID = 'futapp-8bbde'
const DEFAULT_DATABASE_URL = 'https://futapp-8bbde-default-rtdb.firebaseio.com'
const TOKEN_PATH = 'g7app/notifications/tokens'

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    return {
      projectId: parsed.project_id || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    }
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }
}

async function getAccessToken() {
  const serviceAccount = getServiceAccount()

  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY no Netlify.')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }
  const claim = {
    iss: serviceAccount.clientEmail,
    scope: [
      'https://www.googleapis.com/auth/firebase.messaging',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(serviceAccount.privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const jwt = `${unsigned}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error_description || data?.error || 'Não foi possível autenticar no Google.')
  }

  return data.access_token
}

async function loadTokens(accessToken) {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL
  const response = await fetch(`${databaseUrl}/${TOKEN_PATH}.json`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Erro ao ler tokens no Firebase: ${response.status} ${text}`)
  }

  const data = await response.json()
  if (!data) return []

  return Object.entries(data)
    .map(([id, value]) => ({ id, ...value }))
    .filter((item) => item?.enabled !== false && item?.token)
}

async function markTokenDisabled(accessToken, tokenId, reason) {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL
  await fetch(`${databaseUrl}/${TOKEN_PATH}/${tokenId}.json`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      enabled: false,
      disabledAt: new Date().toISOString(),
      disabledReason: reason || 'invalid-token',
    }),
  }).catch(() => null)
}

async function sendToToken({ accessToken, projectId, token, title, body, url }) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title,
          body,
        },
        webpush: {
          notification: {
            title,
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
          },
          fcm_options: {
            link: url || '/',
          },
        },
        data: {
          url: url || '/',
          source: 'g7-app',
        },
      },
    }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.error?.message || data?.error || `Erro FCM ${response.status}`
    const isInvalid = /UNREGISTERED|registration-token-not-registered|invalid/i.test(message)
    return {
      ok: false,
      invalid: isInvalid,
      message,
    }
  }

  return {
    ok: true,
    id: data?.name,
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true })
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, message: 'Use POST.' })
  }

  try {
    const payload = JSON.parse(event.body || '{}')
    const configuredSecret = process.env.G7_PUSH_SECRET

    if (!configuredSecret) {
      return json(500, {
        ok: false,
        message: 'Configure G7_PUSH_SECRET no Netlify antes de enviar notificações.',
      })
    }

    if (!payload.secret || payload.secret !== configuredSecret) {
      return json(401, {
        ok: false,
        message: 'Senha de envio inválida.',
      })
    }

    const title = String(payload.title || 'G7 APP').slice(0, 80)
    const body = String(payload.body || 'Nova atualização publicada.').slice(0, 180)
    const url = String(payload.url || '/')

    const serviceAccount = getServiceAccount()
    const projectId = serviceAccount.projectId || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID
    const accessToken = await getAccessToken()
    const tokens = await loadTokens(accessToken)

    if (tokens.length === 0) {
      return json(200, {
        ok: true,
        sent: 0,
        failed: 0,
        total: 0,
        message: 'Nenhum aparelho cadastrado para receber notificações.',
      })
    }

    const limitedTokens = tokens.slice(0, Number(process.env.G7_PUSH_LIMIT || 500))
    const results = []

    for (const item of limitedTokens) {
      const result = await sendToToken({
        accessToken,
        projectId,
        token: item.token,
        title,
        body,
        url,
      })

      results.push({
        id: item.id,
        ...result,
      })

      if (!result.ok && result.invalid) {
        await markTokenDisabled(accessToken, item.id, result.message)
      }
    }

    const sent = results.filter((item) => item.ok).length
    const failed = results.length - sent

    return json(200, {
      ok: true,
      total: results.length,
      sent,
      failed,
      invalidDisabled: results.filter((item) => item.invalid).length,
      message: `Notificação enviada: ${sent} sucesso(s), ${failed} falha(s).`,
      results: results.slice(0, 20),
    })
  } catch (error) {
    return json(500, {
      ok: false,
      message: error.message || 'Erro ao enviar notificação.',
    })
  }
}
