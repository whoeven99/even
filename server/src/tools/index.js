const { queryRecentWeatherDays } = require('./weatherService')
const {
  createQueryWeatherCurrentTool,
  createQueryWeatherRecentTool,
  createQueryCityByIpTool,
} = require('./weatherTools')
const {
  createListTodosTool,
  createAddTodoTool,
  createUpdateTodoTool,
  createDeleteTodoTool,
} = require('./todoTools')

module.exports = {
  queryRecentWeatherDays,
  createQueryWeatherCurrentTool,
  createQueryWeatherRecentTool,
  createQueryCityByIpTool,
  createListTodosTool,
  createAddTodoTool,
  createUpdateTodoTool,
  createDeleteTodoTool,
}
