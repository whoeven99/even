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
const {
  createGetAssetsTool,
  createAddAssetTool,
  createUpdateAssetTool,
  createDeleteAssetTool,
} = require('./assetTools')
const {
  createGetSubscriptionsTool,
  createAddSubscriptionTool,
  createUpdateSubscriptionTool,
  createDeleteSubscriptionTool,
} = require('./subscriptionTools')
const {
  createListNotesTool,
  createGetNoteTool,
  createSearchNotesTool,
  createAddNoteTool,
  createUpdateNoteTool,
  createDeleteNoteTool,
} = require('./notesTools')
const {
  createListBillMonthsTool,
  createAnalyzeBillMonthTool,
} = require('./billTools')

module.exports = {
  queryRecentWeatherDays,
  createQueryWeatherCurrentTool,
  createQueryWeatherRecentTool,
  createQueryCityByIpTool,
  createListTodosTool,
  createAddTodoTool,
  createUpdateTodoTool,
  createDeleteTodoTool,
  createGetAssetsTool,
  createAddAssetTool,
  createUpdateAssetTool,
  createDeleteAssetTool,
  createGetSubscriptionsTool,
  createAddSubscriptionTool,
  createUpdateSubscriptionTool,
  createDeleteSubscriptionTool,
  createListNotesTool,
  createGetNoteTool,
  createSearchNotesTool,
  createAddNoteTool,
  createUpdateNoteTool,
  createDeleteNoteTool,
  createListBillMonthsTool,
  createAnalyzeBillMonthTool,
}
