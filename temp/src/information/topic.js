"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rssFeeds = exports.convertTopic = exports.allTopics = exports.Topic = void 0;
var Topic;
(function (Topic) {
    Topic["KOREA_TOP"] = "korea-top";
    Topic["WORLD"] = "world";
    Topic["BUSINESS"] = "business";
    Topic["TECH"] = "tech";
    Topic["HEALTH"] = "health";
    Topic["ENTERTAINMENT"] = "entertainment";
    Topic["SPORTS"] = "sports";
    Topic["POLITICS"] = "politics";
})(Topic = exports.Topic || (exports.Topic = {}));
exports.allTopics = Object.values(Topic);
function convertTopic(value) {
    return exports.allTopics.find((topic) => topic === value);
}
exports.convertTopic = convertTopic;
exports.rssFeeds = [
    {
        url: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.KOREA_TOP,
    },
    {
        url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.WORLD,
    },
    {
        url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.BUSINESS,
    },
    {
        url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.TECH,
    },
    {
        url: 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.HEALTH,
    },
    {
        url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.ENTERTAINMENT,
    },
    {
        url: 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.SPORTS,
    },
    {
        url: 'https://news.google.com/rss/search?q=정치&hl=ko&gl=KR&ceid=KR:ko',
        topic: Topic.POLITICS,
    },
];
//# sourceMappingURL=topic.js.map