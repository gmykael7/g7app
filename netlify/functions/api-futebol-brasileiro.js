const DEFAULT_SEASON = '2026'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {})
  }

  const baseUrl = normalizeBaseUrl(process.env.API_FUTEBOL_BR_BASE_URL)

  if (!baseUrl) {
    return json(500, {
      error: 'API_FUTEBOL_BR_BASE_URL não configurada no Netlify.',
      fix: 'Hospede o backend Laravel api-futebol-brasileiro e coloque a URL final terminando em /api nas variáveis de ambiente.',
    })
  }

  const params = event.queryStringParameters || {}
  const resource = params.resource || 'matches'
  const round = params.round || params.rodada
  const season = params.season || params.temporada || DEFAULT_SEASON
  const team = params.team || params.time

  let path = '/campeonato/brasileiro/jogos'

  if (resource === 'standings' || resource === 'tabela') {
    path = round
      ? `/campeonato/brasileiro/tabela-por-rodada/${encodeURIComponent(round)}/${encodeURIComponent(season)}`
      : '/campeonato/brasileiro/tabela'
  } else if (resource === 'matches' || resource === 'jogos') {
    path = round
      ? `/campeonato/brasileiro/jogos-por-rodada/${encodeURIComponent(round)}/${encodeURIComponent(season)}`
      : '/campeonato/brasileiro/jogos'
  } else if (resource === 'team-matches' || resource === 'jogos-time') {
    if (!team) {
      return json(400, { error: 'Informe team ou time para buscar jogos por time.' })
    }
    path = `/campeonato/brasileiro/jogos-por-time/${encodeURIComponent(team)}`
  } else if (resource === 'details' || resource === 'detalhes') {
    const teamsGame = params.teamsGame || params.timesJogo
    const referenceId = params.referenceId || params.idReferencia
    if (!teamsGame || !referenceId) {
      return json(400, { error: 'Informe teamsGame/timesJogo e referenceId/idReferencia.' })
    }
    path = `/campeonato/brasileiro/detalhes/${encodeURIComponent(teamsGame)}/${encodeURIComponent(referenceId)}`
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json' },
    })

    const data = await response.json()

    if (!response.ok) {
      return json(response.status, {
        error: 'A API Futebol Brasileiro retornou erro.',
        status: response.status,
        details: data,
      })
    }

    return json(200, data)
  } catch (error) {
    return json(500, {
      error: 'Erro ao buscar dados na API Futebol Brasileiro.',
      details: error.message,
    })
  }
}

function normalizeBaseUrl(value) {
  if (!value) return ''
  return String(value).replace(/\/+$/, '')
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
