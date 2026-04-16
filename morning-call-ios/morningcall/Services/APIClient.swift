//
//  APIClient.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

import Foundation

enum HTTPMethod: String {
    case GET, POST, PATCH, PUT, DELETE
}

enum APIError: Error {
    case invalidURL
    case noData
    case invalidToken
    case decodingFailed(Error)
    case serverError(Int)
}

struct APIClient {
    static let baseURL = URL(string: "https://morningcall.poapper.com")!

    static func request<T: Decodable>(
        path: String,
        method: HTTPMethod = .GET,
        body: [String: Any?]? = nil,
        requiresAuth: Bool = true,
        completion: @escaping (Result<T, Error>) -> Void
    ) {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let body = body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        func performRequest(with token: String?) {
            if requiresAuth, let token = token {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    completion(.failure(error))
                    return
                }

                if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                    completion(.failure(APIError.serverError(httpResponse.statusCode)))
                    return
                }

                guard let data = data else {
                    completion(.failure(APIError.noData))
                    return
                }

                do {
                    let decoded = try JSONDecoder().decode(T.self, from: data)
                    completion(.success(decoded))
                } catch {
                    completion(.failure(APIError.decodingFailed(error)))
                }
            }.resume()
        }

        if requiresAuth {
            AuthTokenManager.shared.refreshTokenIfNeeded { token in
                guard let token = token else {
                    completion(.failure(APIError.invalidToken))
                    return
                }
                performRequest(with: token)
            }
        } else {
            performRequest(with: nil)
        }
    }

    static func requestVoid(
        path: String,
        method: HTTPMethod = .POST,
        body: [String: Any]? = nil,
        requiresAuth: Bool = true,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            completion(.failure(APIError.invalidURL))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let body = body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        func performRequest(with token: String?) {
            if requiresAuth, let token = token {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            URLSession.shared.dataTask(with: request) { _, response, error in
                if let error = error {
                    completion(.failure(error))
                } else {
                    if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                        completion(.failure(APIError.serverError(httpResponse.statusCode)))
                    } else {
                        completion(.success(()))
                    }
                }
            }.resume()
        }

        if requiresAuth {
            AuthTokenManager.shared.refreshTokenIfNeeded { token in
                guard let token = token else {
                    completion(.failure(APIError.invalidToken))
                    return
                }
                performRequest(with: token)
            }
        } else {
            performRequest(with: nil)
        }
    }
}
