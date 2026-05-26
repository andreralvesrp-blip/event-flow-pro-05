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
      clicksign_webhook_events: {
        Row: {
          document_key: string | null
          event_name: string | null
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          received_at: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          document_key?: string | null
          event_name?: string | null
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          document_key?: string | null
          event_name?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clicksign_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_full: string | null
          cpf: string
          created_at: string
          created_by: string | null
          email: string | null
          father_name: string | null
          first_contact_at: string
          full_name: string
          how_met: string | null
          id: string
          mother_name: string | null
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address_full?: string | null
          cpf: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          father_name?: string | null
          first_contact_at?: string
          full_name: string
          how_met?: string | null
          id?: string
          mother_name?: string | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address_full?: string | null
          cpf?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          father_name?: string | null
          first_contact_at?: string
          full_name?: string
          how_met?: string | null
          id?: string
          mother_name?: string | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_installments: {
        Row: {
          amount: number
          card_installments: number | null
          charge_customer: boolean | null
          contract_id: string
          created_at: string
          due_date: string
          id: string
          manually_edited: boolean
          manually_edited_at: string | null
          manually_edited_by: string | null
          order_index: number
          paid: boolean
          paid_at: string | null
          payment_method: string
          payment_status: string | null
          raw_line: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          card_installments?: number | null
          charge_customer?: boolean | null
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          order_index: number
          paid?: boolean
          paid_at?: string | null
          payment_method: string
          payment_status?: string | null
          raw_line?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          card_installments?: number | null
          charge_customer?: boolean | null
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          order_index?: number
          paid?: boolean
          paid_at?: string | null
          payment_method?: string
          payment_status?: string | null
          raw_line?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_installments_manually_edited_by_fkey"
            columns: ["manually_edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_installments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          additional_services: string | null
          cake: string | null
          canceled_at: string | null
          canceled_by: string | null
          cancellation_financial_action: string | null
          cancellation_reason: string | null
          celebrant_age: number | null
          celebrant_name: string | null
          children_pay_from_age: number | null
          clicksign_document_key: string | null
          clicksign_signed_pdf_url: string | null
          clicksign_template_name: string | null
          client_id: string
          client_signed_at: string | null
          contract_form_date: string | null
          contracted_company_email: string | null
          created_at: string
          decoration: string | null
          event_date: string | null
          event_end_time: string | null
          event_start_time: string | null
          event_weekday_raw: string | null
          finalized_at: string | null
          guest_count: number | null
          hot_dish: string | null
          id: string
          installment_count: number | null
          kids_menu: string | null
          manager_signed_at: string | null
          manual_status_override: boolean
          manually_edited: boolean
          manually_edited_at: string | null
          manually_edited_by: string | null
          observations: string | null
          payment_method: string | null
          payment_schedule_raw: string | null
          raw_webhook_payload: Json | null
          status: Database["public"]["Enums"]["contract_status"]
          tasting_menu: string | null
          tenant_id: string
          total_value: number | null
          updated_at: string
          webhook_received_at: string
        }
        Insert: {
          additional_services?: string | null
          cake?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_financial_action?: string | null
          cancellation_reason?: string | null
          celebrant_age?: number | null
          celebrant_name?: string | null
          children_pay_from_age?: number | null
          clicksign_document_key?: string | null
          clicksign_signed_pdf_url?: string | null
          clicksign_template_name?: string | null
          client_id: string
          client_signed_at?: string | null
          contract_form_date?: string | null
          contracted_company_email?: string | null
          created_at?: string
          decoration?: string | null
          event_date?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          event_weekday_raw?: string | null
          finalized_at?: string | null
          guest_count?: number | null
          hot_dish?: string | null
          id?: string
          installment_count?: number | null
          kids_menu?: string | null
          manager_signed_at?: string | null
          manual_status_override?: boolean
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          observations?: string | null
          payment_method?: string | null
          payment_schedule_raw?: string | null
          raw_webhook_payload?: Json | null
          status?: Database["public"]["Enums"]["contract_status"]
          tasting_menu?: string | null
          tenant_id: string
          total_value?: number | null
          updated_at?: string
          webhook_received_at?: string
        }
        Update: {
          additional_services?: string | null
          cake?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_financial_action?: string | null
          cancellation_reason?: string | null
          celebrant_age?: number | null
          celebrant_name?: string | null
          children_pay_from_age?: number | null
          clicksign_document_key?: string | null
          clicksign_signed_pdf_url?: string | null
          clicksign_template_name?: string | null
          client_id?: string
          client_signed_at?: string | null
          contract_form_date?: string | null
          contracted_company_email?: string | null
          created_at?: string
          decoration?: string | null
          event_date?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          event_weekday_raw?: string | null
          finalized_at?: string | null
          guest_count?: number | null
          hot_dish?: string | null
          id?: string
          installment_count?: number | null
          kids_menu?: string | null
          manager_signed_at?: string | null
          manual_status_override?: boolean
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          observations?: string | null
          payment_method?: string | null
          payment_schedule_raw?: string | null
          raw_webhook_payload?: Json | null
          status?: Database["public"]["Enums"]["contract_status"]
          tasting_menu?: string | null
          tenant_id?: string
          total_value?: number | null
          updated_at?: string
          webhook_received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_manually_edited_by_fkey"
            columns: ["manually_edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          tenant_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          tenant_id: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          cnpj: string | null
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      client_status: "lead" | "cliente"
      contract_status:
        | "rascunho"
        | "aguardando_assinaturas"
        | "assinado"
        | "cancelado"
      user_role: "vendedor" | "gestor" | "admin"
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
      client_status: ["lead", "cliente"],
      contract_status: [
        "rascunho",
        "aguardando_assinaturas",
        "assinado",
        "cancelado",
      ],
      user_role: ["vendedor", "gestor", "admin"],
    },
  },
} as const
