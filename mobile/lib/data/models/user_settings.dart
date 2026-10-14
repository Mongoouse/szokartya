import 'dart:convert';

import '../../core/api/api_client.dart';

/// A bejelentkezett felhasználó profilja és tanulási beállításai (helyben gyorsítótárazva).
class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.timezone,
    required this.dailyNewCardsLimit,
    required this.dailyReviewLimit,
  });

  factory UserProfile.fromJson(Json json) => UserProfile(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['displayName'] as String?,
        timezone: json['timezone'] as String? ?? 'Europe/Budapest',
        dailyNewCardsLimit: (json['dailyNewCardsLimit'] as num?)?.toInt() ?? 20,
        dailyReviewLimit: (json['dailyReviewLimit'] as num?)?.toInt() ?? 200,
      );

  factory UserProfile.decode(String raw) => UserProfile.fromJson(jsonDecode(raw) as Json);

  final String id;
  final String email;
  final String? displayName;
  final String timezone;
  final int dailyNewCardsLimit;
  final int dailyReviewLimit;

  String get greetingName => displayName ?? email.split('@').first;

  Json toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'timezone': timezone,
        'dailyNewCardsLimit': dailyNewCardsLimit,
        'dailyReviewLimit': dailyReviewLimit,
      };

  String encode() => jsonEncode(toJson());
}
