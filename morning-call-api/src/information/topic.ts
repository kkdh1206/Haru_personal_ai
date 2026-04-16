export enum Topic {
  KOREA_TOP = 'korea-top',
  WORLD = 'world',
  BUSINESS = 'business',
  TECH = 'tech',
  HEALTH = 'health',
  ENTERTAINMENT = 'entertainment',
  SPORTS = 'sports',
  POLITICS = 'politics',
}

export const allTopics: Topic[] = Object.values(Topic);

export function convertTopic(value: string): Topic | undefined {
  return allTopics.find((topic) => topic === value);
}

export const rssFeeds = [
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
