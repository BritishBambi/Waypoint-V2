export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      diary_entries: {
        Row: {
          body: string
          created_at: string
          id: string
          is_spoiler: boolean
          log_id: string
          play_date: string | null
          rating: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_spoiler?: boolean
          log_id: string
          play_date?: string | null
          rating?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_spoiler?: boolean
          log_id?: string
          play_date?: string | null
          rating?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "game_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favourite_games: {
        Row: {
          created_at: string
          game_id: number
          id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: number
          id?: string
          position: number
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: number
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourite_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourite_games_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_logs: {
        Row: {
          created_at: string
          finished_at: string | null
          game_id: number
          id: string
          notes: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          game_id: number
          id?: string
          notes?: string | null
          started_at?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          game_id?: number
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_logs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          cover_url: string | null
          genres: string[] | null
          id: number
          igdb_rating: number | null
          igdb_synced_at: string | null
          platforms: string[] | null
          release_date: string | null
          slug: string
          steam_app_id: number | null
          summary: string | null
          title: string
        }
        Insert: {
          cover_url?: string | null
          genres?: string[] | null
          id: number
          igdb_rating?: number | null
          igdb_synced_at?: string | null
          platforms?: string[] | null
          release_date?: string | null
          slug: string
          steam_app_id?: number | null
          summary?: string | null
          title: string
        }
        Update: {
          cover_url?: string | null
          genres?: string[] | null
          id?: number
          igdb_rating?: number | null
          igdb_synced_at?: string | null
          platforms?: string[] | null
          release_date?: string | null
          slug?: string
          steam_app_id?: number | null
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      list_entries: {
        Row: {
          game_id: number
          id: string
          list_id: string
          note: string | null
          position: number | null
        }
        Insert: {
          game_id: number
          id?: string
          list_id: string
          note?: string | null
          position?: number | null
        }
        Update: {
          game_id?: number
          id?: string
          list_id?: string
          note?: string | null
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "list_entries_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_entries_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_likes: {
        Row: {
          created_at: string
          id: string
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_likes_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          is_ranked: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          is_ranked?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          is_ranked?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          emoji: string | null
          id: string
          list_id: string | null
          read: boolean
          review_id: string | null
          title_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          list_id?: string | null
          read?: boolean
          review_id?: string | null
          title_id?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          list_id?: string | null
          read?: boolean
          review_id?: string | null
          title_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_title_id: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          featured_review_id: string | null
          id: string
          is_private: boolean
          showcase_list_1_id: string | null
          showcase_list_2_id: string | null
          showcase_type: string | null
          steam_avatar_url: string | null
          steam_connected_at: string | null
          steam_display_name: string | null
          steam_id: string | null
          updated_at: string
          username: string
          website: string | null
        }
        Insert: {
          active_title_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          featured_review_id?: string | null
          id: string
          is_private?: boolean
          showcase_list_1_id?: string | null
          showcase_list_2_id?: string | null
          showcase_type?: string | null
          steam_avatar_url?: string | null
          steam_connected_at?: string | null
          steam_display_name?: string | null
          steam_id?: string | null
          updated_at?: string
          username: string
          website?: string | null
        }
        Update: {
          active_title_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          featured_review_id?: string | null
          id?: string
          is_private?: boolean
          showcase_list_1_id?: string | null
          showcase_list_2_id?: string | null
          showcase_type?: string | null
          steam_avatar_url?: string | null
          steam_connected_at?: string | null
          steam_display_name?: string | null
          steam_id?: string | null
          updated_at?: string
          username?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_title_id_fkey"
            columns: ["active_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_featured_review_id_fkey"
            columns: ["featured_review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_showcase_list_1_id_fkey"
            columns: ["showcase_list_1_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_showcase_list_2_id_fkey"
            columns: ["showcase_list_2_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      review_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          reply_to_id: string | null
          review_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          review_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_likes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reactions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          game_id: number
          id: string
          is_draft: boolean
          is_spoiler: boolean
          log_id: string
          published_at: string | null
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          game_id: number
          id?: string
          is_draft?: boolean
          is_spoiler?: boolean
          log_id: string
          published_at?: string | null
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          game_id?: number
          id?: string
          is_draft?: boolean
          is_spoiler?: boolean
          log_id?: string
          published_at?: string | null
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: true
            referencedRelation: "game_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          color: string
          created_at: string
          description: string
          game_id: number | null
          icon_url: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          color?: string
          created_at?: string
          description: string
          game_id?: number | null
          icon_url?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          game_id?: number | null
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "titles_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_steam_achievements: {
        Row: {
          achievement_api_name: string
          description: string | null
          global_percent: number | null
          icon_gray_url: string
          icon_url: string
          id: string
          name: string
          steam_app_id: number
          unlock_time: string | null
          unlocked: boolean
          user_id: string
        }
        Insert: {
          achievement_api_name: string
          description?: string | null
          global_percent?: number | null
          icon_gray_url: string
          icon_url: string
          id?: string
          name: string
          steam_app_id: number
          unlock_time?: string | null
          unlocked?: boolean
          user_id: string
        }
        Update: {
          achievement_api_name?: string
          description?: string | null
          global_percent?: number | null
          icon_gray_url?: string
          icon_url?: string
          id?: string
          name?: string
          steam_app_id?: number
          unlock_time?: string | null
          unlocked?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_steam_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_steam_data: {
        Row: {
          achievements_total: number
          achievements_unlocked: number
          game_id: number | null
          id: string
          last_synced_at: string | null
          playtime_minutes: number
          steam_app_id: number
          user_id: string
        }
        Insert: {
          achievements_total?: number
          achievements_unlocked?: number
          game_id?: number | null
          id?: string
          last_synced_at?: string | null
          playtime_minutes?: number
          steam_app_id: number
          user_id: string
        }
        Update: {
          achievements_total?: number
          achievements_unlocked?: number
          game_id?: number | null
          id?: string
          last_synced_at?: string | null
          playtime_minutes?: number
          steam_app_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_steam_data_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_steam_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_titles: {
        Row: {
          awarded_at: string
          title_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          title_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_titles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_titles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      upsert_games: {
        Args: { game_data: Json }
        Returns: {
          error: string
          success: boolean
        }[]
      }
    }
    Enums: {
      notification_type:
        | "follow"
        | "review_like"
        | "review_comment"
        | "welcome"
        | "review_reaction"
        | "list_like"
        | "comment_reply"
        | "title_unlocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      notification_type: [
        "follow",
        "review_like",
        "review_comment",
        "welcome",
        "review_reaction",
        "list_like",
        "comment_reply",
        "title_unlocked",
      ],
    },
  },
} as const
