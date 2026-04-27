const { z } = require('zod')
const {
  WEATHER_DEFAULT_CITY,
  queryLiveWeather,
  queryRecentWeatherDays,
  formatRecentWeatherResult,
  queryCityByIp,
} = require('./weatherService')

function createQueryWeatherCurrentTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'query_weather_current',
    description:
      `查询城市天气，返回天气、温度和湿度。若 city 为空会默认使用 ${WEATHER_DEFAULT_CITY}。遇到天气问题必须优先调用该工具。`,
    schema: z.object({
      city: z
        .string()
        .optional()
        .default('')
        .describe('要查询天气的城市名称，可传“北京”或“帮我看下北京天气”这类自然语句'),
    }),
    func: async ({ city }) => {
      return queryLiveWeather(city || WEATHER_DEFAULT_CITY)
    },
  })
}

function createQueryWeatherRecentTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'query_weather_recent',
    description: '查询某个城市最近几天的天气趋势（1-7 天）。',
    schema: z.object({
      city: z.string().optional().default('').describe('城市名，可为空'),
      days: z.number().int().min(1).max(7).optional().default(3).describe('查询天数'),
    }),
    func: async ({ city, days }) => {
      const result = await queryRecentWeatherDays(city || WEATHER_DEFAULT_CITY, days || 3)
      return formatRecentWeatherResult(result)
    },
  })
}

function createQueryCityByIpTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'query_city_by_ip',
    description: '根据公网 IP 粗略定位当前城市。',
    schema: z.object({}),
    func: async () => {
      const result = await queryCityByIp()
      if (!result.ok) {
        return `IP 定位失败：${result.message}`
      }
      return `当前 IP 位置城市：${result.city}（来源: ${result.source}）`
    },
  })
}

module.exports = {
  createQueryWeatherCurrentTool,
  createQueryWeatherRecentTool,
  createQueryCityByIpTool,
}
