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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_recommendations: {
        Row: {
          candidate_id: string
          created_at: string
          created_by_role: Database["public"]["Enums"]["app_role"]
          id: string
          language: Database["public"]["Enums"]["preferred_language"]
          recommendation: string
          recommended_action: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          created_by_role?: Database["public"]["Enums"]["app_role"]
          id?: string
          language?: Database["public"]["Enums"]["preferred_language"]
          recommendation: string
          recommended_action?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          created_by_role?: Database["public"]["Enums"]["app_role"]
          id?: string
          language?: Database["public"]["Enums"]["preferred_language"]
          recommendation?: string
          recommended_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          age: number | null
          assigned_to: string | null
          city: Database["public"]["Enums"]["candidate_city"] | null
          created_at: string
          created_by: string | null
          documents: Json
          full_name: Json
          id: string
          last_contacted_at: string | null
          license: string | null
          license_status: Database["public"]["Enums"]["license_status"]
          localized_profile: Json
          name: string
          next_step_due_at: string | null
          notes: string | null
          phone: string | null
          preferred_language: Database["public"]["Enums"]["preferred_language"]
          stage: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          assigned_to?: string | null
          city?: Database["public"]["Enums"]["candidate_city"] | null
          created_at?: string
          created_by?: string | null
          documents?: Json
          full_name?: Json
          id?: string
          last_contacted_at?: string | null
          license?: string | null
          license_status?: Database["public"]["Enums"]["license_status"]
          localized_profile?: Json
          name: string
          next_step_due_at?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["preferred_language"]
          stage?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          assigned_to?: string | null
          city?: Database["public"]["Enums"]["candidate_city"] | null
          created_at?: string
          created_by?: string | null
          documents?: Json
          full_name?: Json
          id?: string
          last_contacted_at?: string | null
          license?: string | null
          license_status?: Database["public"]["Enums"]["license_status"]
          localized_profile?: Json
          name?: string
          next_step_due_at?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["preferred_language"]
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_assets: {
        Row: {
          created_at: string
          fleet_group: string
          id: string
          last_service_date: string | null
          mileage: number
          next_service_date: string | null
          notes: string | null
          plate_number: string
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
          vehicle_name: string
        }
        Insert: {
          created_at?: string
          fleet_group?: string
          id?: string
          last_service_date?: string | null
          mileage?: number
          next_service_date?: string | null
          notes?: string | null
          plate_number: string
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          vehicle_name: string
        }
        Update: {
          created_at?: string
          fleet_group?: string
          id?: string
          last_service_date?: string | null
          mileage?: number
          next_service_date?: string | null
          notes?: string | null
          plate_number?: string
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          vehicle_name?: string
        }
        Relationships: []
      }
      finance_entries: {
        Row: {
          amount: number
          candidate_id: string | null
          city: Database["public"]["Enums"]["candidate_city"] | null
          company: Database["public"]["Enums"]["bus_company"] | null
          created_at: string
          currency: string
          due_date: string | null
          entry_type: Database["public"]["Enums"]["finance_entry_type"]
          id: string
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["finance_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          candidate_id?: string | null
          city?: Database["public"]["Enums"]["candidate_city"] | null
          company?: Database["public"]["Enums"]["bus_company"] | null
          created_at?: string
          currency?: string
          due_date?: string | null
          entry_type: Database["public"]["Enums"]["finance_entry_type"]
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["finance_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          candidate_id?: string | null
          city?: Database["public"]["Enums"]["candidate_city"] | null
          company?: Database["public"]["Enums"]["bus_company"] | null
          created_at?: string
          currency?: string
          due_date?: string | null
          entry_type?: Database["public"]["Enums"]["finance_entry_type"]
          id?: string
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["finance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          audience_language: Database["public"]["Enums"]["preferred_language"]
          body: string
          created_at: string
          id: string
          role_owner: Database["public"]["Enums"]["app_role"]
          template_key: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_language: Database["public"]["Enums"]["preferred_language"]
          body: string
          created_at?: string
          id?: string
          role_owner?: Database["public"]["Enums"]["app_role"]
          template_key: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_language?: Database["public"]["Enums"]["preferred_language"]
          body?: string
          created_at?: string
          id?: string
          role_owner?: Database["public"]["Enums"]["app_role"]
          template_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      operation_logs: {
        Row: {
          candidate_id: string | null
          created_at: string
          follow_up_required: boolean
          id: string
          interaction_type: string
          log_date: string
          notes_amharic: string | null
          notes_hebrew: string | null
          notes_russian: string | null
          operator_name: string
          sentiment: string | null
          source_message: string | null
          translated_hebrew: string | null
          updated_at: string
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          follow_up_required?: boolean
          id?: string
          interaction_type?: string
          log_date?: string
          notes_amharic?: string | null
          notes_hebrew?: string | null
          notes_russian?: string | null
          operator_name?: string
          sentiment?: string | null
          source_message?: string | null
          translated_hebrew?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          follow_up_required?: boolean
          id?: string
          interaction_type?: string
          log_date?: string
          notes_amharic?: string | null
          notes_hebrew?: string | null
          notes_russian?: string | null
          operator_name?: string
          sentiment?: string | null
          source_message?: string | null
          translated_hebrew?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_logs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role:
        | {
            Args: {
              _roles: Database["public"]["Enums"]["app_role"][]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _roles: string[]; _user_id: string }; Returns: boolean }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "ceo"
        | "evp"
        | "coo"
        | "cfo"
        | "recruiter"
        | "viewer"
        | "super_admin"
        | "operator"
      asset_status: "active" | "service_due" | "in_service" | "inactive"
      bus_company: "Egged" | "Afikim"
      candidate_city:
        | "Ashkelon"
        | "Kiryat Gat"
        | "Ashdod"
        | "Tel Aviv"
        | "Jerusalem"
        | "Haifa"
        | "Beer Sheva"
        | "Netanya"
        | "Rishon LeZion"
        | "Petah Tikva"
        | "Holon"
        | "Bnei Brak"
        | "Ramat Gan"
        | "Bat Yam"
        | "Rehovot"
        | "Herzliya"
        | "Kfar Saba"
        | "Modiin"
        | "Eilat"
        | "Tiberias"
        | "Nazareth"
        | "Acre"
        | "Lod"
        | "Ramla"
        | "Afula"
        | "Nahariya"
        | "Nes Ziona"
        | "Beit Shemesh"
        | "Kiryat Ata"
        | "Kiryat Bialik"
        | "Rosh HaAyin"
        | "Yavne"
        | "Dimona"
        | "Sderot"
        | "Beit Shean"
        | "Other"
      candidate_stage: "Lead" | "Learning" | "Test" | "Placed"
      finance_entry_type:
        | "revenue_pending"
        | "revenue_received"
        | "maintenance_expense"
        | "other_expense"
      finance_status: "pending" | "paid" | "overdue" | "cancelled"
      license_status:
        | "Not Started"
        | "Learning"
        | "Theory Ready"
        | "Test Scheduled"
        | "Licensed"
      preferred_language: "he" | "am" | "ru"
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
      app_role: [
        "admin",
        "ceo",
        "evp",
        "coo",
        "cfo",
        "recruiter",
        "viewer",
        "super_admin",
        "operator",
      ],
      asset_status: ["active", "service_due", "in_service", "inactive"],
      bus_company: ["Egged", "Afikim"],
      candidate_city: [
        "Ashkelon",
        "Kiryat Gat",
        "Ashdod",
        "Tel Aviv",
        "Jerusalem",
        "Haifa",
        "Beer Sheva",
        "Netanya",
        "Rishon LeZion",
        "Petah Tikva",
        "Holon",
        "Bnei Brak",
        "Ramat Gan",
        "Bat Yam",
        "Rehovot",
        "Herzliya",
        "Kfar Saba",
        "Modiin",
        "Eilat",
        "Tiberias",
        "Nazareth",
        "Acre",
        "Lod",
        "Ramla",
        "Afula",
        "Nahariya",
        "Nes Ziona",
        "Beit Shemesh",
        "Kiryat Ata",
        "Kiryat Bialik",
        "Rosh HaAyin",
        "Yavne",
        "Dimona",
        "Sderot",
        "Beit Shean",
        "Other",
      ],
      candidate_stage: ["Lead", "Learning", "Test", "Placed"],
      finance_entry_type: [
        "revenue_pending",
        "revenue_received",
        "maintenance_expense",
        "other_expense",
      ],
      finance_status: ["pending", "paid", "overdue", "cancelled"],
      license_status: [
        "Not Started",
        "Learning",
        "Theory Ready",
        "Test Scheduled",
        "Licensed",
      ],
      preferred_language: ["he", "am", "ru"],
    },
  },
} as const
