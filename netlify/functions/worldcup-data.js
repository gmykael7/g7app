const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=1000&dates=20260611-20260719'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {})
  }

  try {
    const response = await fetch(ESPN_SCOREBOARD_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'G7APP/1.0',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return json(response.status, {
        error: 'Fonte da Copa do Mundo retornou erro.',
        status: response.status,
        details: data,
      })
    }

    return json(200, data)
  } catch (error) {
    return json(500, {
      error: 'Erro ao buscar dados atuais da Copa do Mundo.',
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
