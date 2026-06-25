const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'

const competitionMap = {
  WC: 'WC',
  BSA: 'BSA',
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {})
  }

  const token = process.env.FOOTBALL_DATA_TOKEN

  if (!token) {
    return json(500, {
      error: 'FOOTBALL_DATA_TOKEN não configurado no Netlify.',
      fix: 'Adicione a chave em Site configuration > Environment variables e faça novo deploy.',
    })
  }

  const params = event.queryStringParameters || {}
  const resource = params.resource || 'matches'
  const competition = competitionMap[params.competition] || params.competition || 'WC'

  let path

  if (resource === 'standings') {
    path = `/competitions/${competition}/standings`
  } else if (resource === 'teams') {
    path = `/competitions/${competition}/teams`
  } else {
    path = `/competitions/${competition}/matches`
  }

  try {
    const response = await fetch(`${FOOTBALL_DATA_BASE}${path}`, {
      headers: {
        'X-Auth-Token': token,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return json(response.status, {
        error: 'A API esportiva retornou erro.',
        status: response.status,
        details: data,
      })
    }

    return json(200, data)
  } catch (error) {
    return json(500, {
      error: 'Erro ao buscar dados esportivos.',
      details: error.message,
    })
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: statusCode === 204 ? '' : JSON.stringify(body),
  }
}
