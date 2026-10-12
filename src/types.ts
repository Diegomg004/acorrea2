import type { Repeat, VoteValue } from './lib/logic.ts';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  color: string;
}
export interface Group {
  id: string;
  name: string;
  home_label: string;
  home_lat: number;
  home_lon: number;
  created_by: string | null;
}
export interface Member {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile: Profile;
}
export interface Vote { plan_id: string; user_id: string; vote: VoteValue; updated_at: string }
export interface Rating {
  plan_id: string;
  user_id: string;
  score: number;
  liked: string;
  improve: string;
  would_repeat: Repeat;
  created_at: string;
}
export interface Plan {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  description: string;
  link_url: string | null;
  photos: string[];
  starts_at: string;
  duration_minutes: number;
  price_per_person: number | null;
  price_note: string;
  location_name: string;
  lat: number | null;
  lon: number | null;
  drive_minutes: number | null;
  drive_km: number | null;
  created_at: string;
  plan_votes: Vote[];
  plan_ratings: Rating[];
}
export interface Message {
  id: number;
  group_id: string;
  plan_id: string | null;
  user_id: string;
  body: string;
  created_at: string;
}
