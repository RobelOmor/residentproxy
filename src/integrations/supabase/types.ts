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
      app_config: {
        Row: {
          id: number
          price_per_gb_usdt: number
          proxy_dashboard_token: string | null
          proxy_passwd: string | null
          proxy_username: string | null
          updated_at: string
          usdt_address: string | null
          usdt_network: string | null
        }
        Insert: {
          id?: number
          price_per_gb_usdt?: number
          proxy_dashboard_token?: string | null
          proxy_passwd?: string | null
          proxy_username?: string | null
          updated_at?: string
          usdt_address?: string | null
          usdt_network?: string | null
        }
        Update: {
          id?: number
          price_per_gb_usdt?: number
          proxy_dashboard_token?: string | null
          proxy_passwd?: string | null
          proxy_username?: string | null
          updated_at?: string
          usdt_address?: string | null
          usdt_network?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance_usdt: number
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          balance_usdt?: number
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          balance_usdt?: number
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      proxy_orders: {
        Row: {
          admin_note: string | null
          api_response: Json | null
          approved_at: string | null
          cost_usdt: number
          created_at: string
          expire: string | null
          gb_amount: number
          host: string | null
          id: string
          order_no: string | null
          port: string | null
          proto: string | null
          proxy_passwd: string | null
          proxy_username: string | null
          status: string
          tx_hash: string | null
          un: string | null
          un_flow: string | null
          un_flow_used: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          api_response?: Json | null
          approved_at?: string | null
          cost_usdt: number
          created_at?: string
          expire?: string | null
          gb_amount: number
          host?: string | null
          id?: string
          order_no?: string | null
          port?: string | null
          proto?: string | null
          proxy_passwd?: string | null
          proxy_username?: string | null
          status?: string
          tx_hash?: string | null
          un?: string | null
          un_flow?: string | null
          un_flow_used?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          api_response?: Json | null
          approved_at?: string | null
          cost_usdt?: number
          created_at?: string
          expire?: string | null
          gb_amount?: number
          host?: string | null
          id?: string
          order_no?: string | null
          port?: string | null
          proto?: string | null
          proxy_passwd?: string | null
          proxy_username?: string | null
          status?: string
          tx_hash?: string | null
          un?: string | null
          un_flow?: string | null
          un_flow_used?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sub_user_pool: {
        Row: {
          assigned_at: string | null
          assigned_to_order_id: string | null
          created_at: string
          expire_at: string | null
          host: string
          id: string
          mb_capacity: number
          mb_used: number
          note: string | null
          passwd: string
          port: string
          proto: string
          suname: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to_order_id?: string | null
          created_at?: string
          expire_at?: string | null
          host?: string
          id?: string
          mb_capacity: number
          mb_used?: number
          note?: string | null
          passwd: string
          port?: string
          proto?: string
          suname: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to_order_id?: string | null
          created_at?: string
          expire_at?: string | null
          host?: string
          id?: string
          mb_capacity?: number
          mb_used?: number
          note?: string | null
          passwd?: string
          port?: string
          proto?: string
          suname?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_user_pool_assigned_to_order_id_fkey"
            columns: ["assigned_to_order_id"]
            isOneToOne: false
            referencedRelation: "proxy_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      topup_requests: {
        Row: {
          admin_note: string | null
          amount_usdt: number
          approved_at: string | null
          created_at: string
          id: string
          status: string
          tx_hash: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_usdt: number
          approved_at?: string | null
          created_at?: string
          id?: string
          status?: string
          tx_hash: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_usdt?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          status?: string
          tx_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _rand_lc: { Args: { n: number }; Returns: string }
      admin_approve_order_manual: {
        Args: {
          _expire: string
          _order_id: string
          _order_no: string
          _passwd: string
          _suname: string
          _un_flow: string
          _un_flow_used: string
        }
        Returns: undefined
      }
      admin_approve_topup: { Args: { _topup_id: string }; Returns: undefined }
      admin_assign_sub_user_to_order: {
        Args: { _order_id: string }
        Returns: Json
      }
      admin_reject_order_refund: {
        Args: { _note?: string; _order_id: string }
        Returns: undefined
      }
      admin_reject_topup: {
        Args: { _note?: string; _topup_id: string }
        Returns: undefined
      }
      admin_update_pool_usage: {
        Args: { _mb_used: number; _pool_id: string }
        Returns: undefined
      }
      get_711_credentials: {
        Args: never
        Returns: {
          passwd: string
          username: string
        }[]
      }
      get_public_pricing: {
        Args: never
        Returns: {
          price_per_gb_usdt: number
          usdt_address: string
          usdt_network: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purchase_proxy_with_balance: {
        Args: { _cost: number; _gb: number }
        Returns: string
      }
      sync_my_orders_usage_from_pool: { Args: never; Returns: number }
      update_my_order_usage: {
        Args: {
          _expire: string
          _order_id: string
          _un_flow: string
          _un_flow_used: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
