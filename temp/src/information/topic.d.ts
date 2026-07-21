export declare enum Topic {
    KOREA_TOP = "korea-top",
    WORLD = "world",
    BUSINESS = "business",
    TECH = "tech",
    HEALTH = "health",
    ENTERTAINMENT = "entertainment",
    SPORTS = "sports",
    POLITICS = "politics"
}
export declare const allTopics: Topic[];
export declare function convertTopic(value: string): Topic | undefined;
export declare const rssFeeds: {
    url: string;
    topic: Topic;
}[];
