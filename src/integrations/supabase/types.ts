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
          bairro: string | null
          cep: string | null
          cidade: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          father_name: string | null
          first_contact_at: string
          full_name: string
          how_met: string | null
          id: string
          legacy_document_raw: string | null
          mother_name: string | null
          notes: string | null
          phone: string | null
          source: Database["public"]["Enums"]["opportunity_source"] | null
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          address_full?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          father_name?: string | null
          first_contact_at?: string
          full_name: string
          how_met?: string | null
          id?: string
          legacy_document_raw?: string | null
          mother_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["opportunity_source"] | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          address_full?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          father_name?: string | null
          first_contact_at?: string
          full_name?: string
          how_met?: string | null
          id?: string
          legacy_document_raw?: string | null
          mother_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["opportunity_source"] | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          unit_id?: string | null
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
          {
            foreignKeyName: "clients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
          due_date: string | null
          financial_scope: string | null
          id: string
          import_warnings: string | null
          is_historical: boolean | null
          legacy_contract_key: string | null
          legacy_import_batch_id: string | null
          manually_edited: boolean
          manually_edited_at: string | null
          manually_edited_by: string | null
          needs_review: boolean | null
          order_index: number
          paid: boolean
          paid_at: string | null
          payment_method: string
          payment_status: string | null
          raw_line: string | null
          source_system: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          card_installments?: number | null
          charge_customer?: boolean | null
          contract_id: string
          created_at?: string
          due_date?: string | null
          financial_scope?: string | null
          id?: string
          import_warnings?: string | null
          is_historical?: boolean | null
          legacy_contract_key?: string | null
          legacy_import_batch_id?: string | null
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          needs_review?: boolean | null
          order_index: number
          paid?: boolean
          paid_at?: string | null
          payment_method: string
          payment_status?: string | null
          raw_line?: string | null
          source_system?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          card_installments?: number | null
          charge_customer?: boolean | null
          contract_id?: string
          created_at?: string
          due_date?: string | null
          financial_scope?: string | null
          id?: string
          import_warnings?: string | null
          is_historical?: boolean | null
          legacy_contract_key?: string | null
          legacy_import_batch_id?: string | null
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          needs_review?: boolean | null
          order_index?: number
          paid?: boolean
          paid_at?: string | null
          payment_method?: string
          payment_status?: string | null
          raw_line?: string | null
          source_system?: string | null
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
          financial_scope: string | null
          guest_count: number | null
          hot_dish: string | null
          id: string
          import_warnings: string | null
          installment_count: number | null
          is_historical: boolean | null
          kids_menu: string | null
          legacy_contract_key: string | null
          legacy_import_batch_id: string | null
          legacy_notes: string | null
          manager_signed_at: string | null
          manual_status_override: boolean
          manually_edited: boolean
          manually_edited_at: string | null
          manually_edited_by: string | null
          needs_review: boolean | null
          observations: string | null
          opportunity_id: string | null
          payment_method: string | null
          payment_schedule_raw: string | null
          raw_webhook_payload: Json | null
          source_system: string | null
          status: Database["public"]["Enums"]["contract_status"]
          tasting_menu: string | null
          tenant_id: string
          total_value: number | null
          unit_id: string | null
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
          financial_scope?: string | null
          guest_count?: number | null
          hot_dish?: string | null
          id?: string
          import_warnings?: string | null
          installment_count?: number | null
          is_historical?: boolean | null
          kids_menu?: string | null
          legacy_contract_key?: string | null
          legacy_import_batch_id?: string | null
          legacy_notes?: string | null
          manager_signed_at?: string | null
          manual_status_override?: boolean
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          needs_review?: boolean | null
          observations?: string | null
          opportunity_id?: string | null
          payment_method?: string | null
          payment_schedule_raw?: string | null
          raw_webhook_payload?: Json | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tasting_menu?: string | null
          tenant_id: string
          total_value?: number | null
          unit_id?: string | null
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
          financial_scope?: string | null
          guest_count?: number | null
          hot_dish?: string | null
          id?: string
          import_warnings?: string | null
          installment_count?: number | null
          is_historical?: boolean | null
          kids_menu?: string | null
          legacy_contract_key?: string | null
          legacy_import_batch_id?: string | null
          legacy_notes?: string | null
          manager_signed_at?: string | null
          manual_status_override?: boolean
          manually_edited?: boolean
          manually_edited_at?: string | null
          manually_edited_by?: string | null
          needs_review?: boolean | null
          observations?: string | null
          opportunity_id?: string | null
          payment_method?: string | null
          payment_schedule_raw?: string | null
          raw_webhook_payload?: Json | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tasting_menu?: string | null
          tenant_id?: string
          total_value?: number | null
          unit_id?: string | null
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
            foreignKeyName: "contracts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          active: boolean
          attendant_avatar_url: string | null
          attendant_name: string | null
          attendant_online: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          privacy_policy_url: string | null
          slug: string
          source: Database["public"]["Enums"]["opportunity_source"]
          tenant_id: string
          unit_id: string | null
          updated_at: string
          utm_campaign: string | null
          welcome_message: string
          widget_avatar_url: string | null
          widget_delay: number | null
          widget_msg_1: string | null
          widget_msg_2: string | null
          widget_msg_3: string | null
        }
        Insert: {
          active?: boolean
          attendant_avatar_url?: string | null
          attendant_name?: string | null
          attendant_online?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          privacy_policy_url?: string | null
          slug: string
          source?: Database["public"]["Enums"]["opportunity_source"]
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          welcome_message?: string
          widget_avatar_url?: string | null
          widget_delay?: number | null
          widget_msg_1?: string | null
          widget_msg_2?: string | null
          widget_msg_3?: string | null
        }
        Update: {
          active?: boolean
          attendant_avatar_url?: string | null
          attendant_name?: string | null
          attendant_online?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          privacy_policy_url?: string | null
          slug?: string
          source?: Database["public"]["Enums"]["opportunity_source"]
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          welcome_message?: string
          widget_avatar_url?: string | null
          widget_delay?: number | null
          widget_msg_1?: string | null
          widget_msg_2?: string | null
          widget_msg_3?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_import_batches: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          diagnostic: Json | null
          id: string
          source_file_name: string | null
          status: string
          tenant_id: string
          total_clients: number | null
          total_festas: number | null
          total_parcelas: number | null
          total_revisao: number | null
        }
        Insert: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          diagnostic?: Json | null
          id?: string
          source_file_name?: string | null
          status?: string
          tenant_id: string
          total_clients?: number | null
          total_festas?: number | null
          total_parcelas?: number | null
          total_revisao?: number | null
        }
        Update: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          diagnostic?: Json | null
          id?: string
          source_file_name?: string | null
          status?: string
          tenant_id?: string
          total_clients?: number | null
          total_festas?: number | null
          total_parcelas?: number | null
          total_revisao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_batches_committed_by_fkey"
            columns: ["committed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_import_clients: {
        Row: {
          address_full: string | null
          created_at: string
          created_client_id: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          errors: string | null
          father_name: string | null
          full_name: string | null
          how_met: string | null
          id: string
          import_batch_id: string
          import_status: string | null
          legacy_client_key: string | null
          legacy_document_raw: string | null
          mother_name: string | null
          needs_review: boolean | null
          notes: string | null
          phone: string | null
          raw_row: Json | null
          tenant_id: string
          warnings: string | null
        }
        Insert: {
          address_full?: string | null
          created_at?: string
          created_client_id?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          errors?: string | null
          father_name?: string | null
          full_name?: string | null
          how_met?: string | null
          id?: string
          import_batch_id: string
          import_status?: string | null
          legacy_client_key?: string | null
          legacy_document_raw?: string | null
          mother_name?: string | null
          needs_review?: boolean | null
          notes?: string | null
          phone?: string | null
          raw_row?: Json | null
          tenant_id: string
          warnings?: string | null
        }
        Update: {
          address_full?: string | null
          created_at?: string
          created_client_id?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          errors?: string | null
          father_name?: string | null
          full_name?: string | null
          how_met?: string | null
          id?: string
          import_batch_id?: string
          import_status?: string | null
          legacy_client_key?: string | null
          legacy_document_raw?: string | null
          mother_name?: string | null
          needs_review?: boolean | null
          notes?: string | null
          phone?: string | null
          raw_row?: Json | null
          tenant_id?: string
          warnings?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_clients_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "legacy_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_import_festas: {
        Row: {
          additional_services: string | null
          cake: string | null
          celebrant_age: number | null
          celebrant_name: string | null
          children_pay_from_age: number | null
          contract_form_date: string | null
          contracted_company_email: string | null
          created_at: string
          created_contract_id: string | null
          decoration: string | null
          errors: string | null
          event_date: string | null
          event_end_time: string | null
          event_start_time: string | null
          event_weekday_raw: string | null
          financial_scope: string | null
          guest_count: number | null
          hot_dish: string | null
          id: string
          import_batch_id: string
          import_status: string | null
          installment_count: number | null
          is_historical: boolean | null
          kids_menu: string | null
          legacy_client_key: string | null
          legacy_contract_key: string | null
          legacy_notes: string | null
          needs_review: boolean | null
          observations: string | null
          payment_method: string | null
          payment_schedule_raw: string | null
          raw_row: Json | null
          status: string | null
          tasting_menu: string | null
          tenant_id: string
          total_value: number | null
          warnings: string | null
        }
        Insert: {
          additional_services?: string | null
          cake?: string | null
          celebrant_age?: number | null
          celebrant_name?: string | null
          children_pay_from_age?: number | null
          contract_form_date?: string | null
          contracted_company_email?: string | null
          created_at?: string
          created_contract_id?: string | null
          decoration?: string | null
          errors?: string | null
          event_date?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          event_weekday_raw?: string | null
          financial_scope?: string | null
          guest_count?: number | null
          hot_dish?: string | null
          id?: string
          import_batch_id: string
          import_status?: string | null
          installment_count?: number | null
          is_historical?: boolean | null
          kids_menu?: string | null
          legacy_client_key?: string | null
          legacy_contract_key?: string | null
          legacy_notes?: string | null
          needs_review?: boolean | null
          observations?: string | null
          payment_method?: string | null
          payment_schedule_raw?: string | null
          raw_row?: Json | null
          status?: string | null
          tasting_menu?: string | null
          tenant_id: string
          total_value?: number | null
          warnings?: string | null
        }
        Update: {
          additional_services?: string | null
          cake?: string | null
          celebrant_age?: number | null
          celebrant_name?: string | null
          children_pay_from_age?: number | null
          contract_form_date?: string | null
          contracted_company_email?: string | null
          created_at?: string
          created_contract_id?: string | null
          decoration?: string | null
          errors?: string | null
          event_date?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          event_weekday_raw?: string | null
          financial_scope?: string | null
          guest_count?: number | null
          hot_dish?: string | null
          id?: string
          import_batch_id?: string
          import_status?: string | null
          installment_count?: number | null
          is_historical?: boolean | null
          kids_menu?: string | null
          legacy_client_key?: string | null
          legacy_contract_key?: string | null
          legacy_notes?: string | null
          needs_review?: boolean | null
          observations?: string | null
          payment_method?: string | null
          payment_schedule_raw?: string | null
          raw_row?: Json | null
          status?: string | null
          tasting_menu?: string | null
          tenant_id?: string
          total_value?: number | null
          warnings?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_festas_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "legacy_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_festas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_import_parcelas: {
        Row: {
          amount: number | null
          card_installments: number | null
          charge_customer: boolean | null
          created_at: string
          created_installment_id: string | null
          due_date: string | null
          errors: string | null
          financial_scope: string | null
          id: string
          import_batch_id: string
          import_status: string | null
          is_historical: boolean | null
          legacy_contract_key: string | null
          needs_review: boolean | null
          order_index: number | null
          paid: boolean | null
          paid_at: string | null
          payment_method: string | null
          payment_status: string | null
          raw_line: string | null
          raw_row: Json | null
          tenant_id: string
          warnings: string | null
        }
        Insert: {
          amount?: number | null
          card_installments?: number | null
          charge_customer?: boolean | null
          created_at?: string
          created_installment_id?: string | null
          due_date?: string | null
          errors?: string | null
          financial_scope?: string | null
          id?: string
          import_batch_id: string
          import_status?: string | null
          is_historical?: boolean | null
          legacy_contract_key?: string | null
          needs_review?: boolean | null
          order_index?: number | null
          paid?: boolean | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          raw_line?: string | null
          raw_row?: Json | null
          tenant_id: string
          warnings?: string | null
        }
        Update: {
          amount?: number | null
          card_installments?: number | null
          charge_customer?: boolean | null
          created_at?: string
          created_installment_id?: string | null
          due_date?: string | null
          errors?: string | null
          financial_scope?: string | null
          id?: string
          import_batch_id?: string
          import_status?: string | null
          is_historical?: boolean | null
          legacy_contract_key?: string | null
          needs_review?: boolean | null
          order_index?: number | null
          paid?: boolean | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          raw_line?: string | null
          raw_row?: Json | null
          tenant_id?: string
          warnings?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_parcelas_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "legacy_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_parcelas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_import_revisao: {
        Row: {
          acao_recomendada: string | null
          campo: string | null
          created_at: string
          id: string
          import_batch_id: string
          legacy_client_key: string | null
          legacy_contract_key: string | null
          observacao: string | null
          origem: string | null
          raw_row: Json | null
          severidade: string | null
          source_row_number: number | null
          tenant_id: string
          tipo_problema: string | null
          valor_normalizado: string | null
          valor_original: string | null
        }
        Insert: {
          acao_recomendada?: string | null
          campo?: string | null
          created_at?: string
          id?: string
          import_batch_id: string
          legacy_client_key?: string | null
          legacy_contract_key?: string | null
          observacao?: string | null
          origem?: string | null
          raw_row?: Json | null
          severidade?: string | null
          source_row_number?: number | null
          tenant_id: string
          tipo_problema?: string | null
          valor_normalizado?: string | null
          valor_original?: string | null
        }
        Update: {
          acao_recomendada?: string | null
          campo?: string | null
          created_at?: string
          id?: string
          import_batch_id?: string
          legacy_client_key?: string | null
          legacy_contract_key?: string | null
          observacao?: string | null
          origem?: string | null
          raw_row?: Json | null
          severidade?: string | null
          source_row_number?: number | null
          tenant_id?: string
          tipo_problema?: string | null
          valor_normalizado?: string | null
          valor_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_revisao_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "legacy_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_import_revisao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_events: {
        Row: {
          created_at: string
          event_name: string
          fbclid: string | null
          form_slug: string | null
          gclid: string | null
          id: string
          ip_hash: string | null
          landing_page: string | null
          open_method: string | null
          page_location: string | null
          page_path: string | null
          referrer: string | null
          session_id: string | null
          tenant_id: string
          unit_id: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          fbclid?: string | null
          form_slug?: string | null
          gclid?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          open_method?: string | null
          page_location?: string | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string | null
          tenant_id: string
          unit_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          fbclid?: string | null
          form_slug?: string | null
          gclid?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          open_method?: string | null
          page_location?: string | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string | null
          tenant_id?: string
          unit_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          classification: Database["public"]["Enums"]["nps_classification"]
          comment: string | null
          created_at: string
          event_id: string | null
          experience: Database["public"]["Enums"]["nps_experience"] | null
          id: string
          name: string | null
          redirected_to_google: boolean
          score: number | null
          status: Database["public"]["Enums"]["nps_status"]
          tenant_id: string
          unit_id: string
          updated_at: string
          wants_google_review: boolean
          whatsapp: string | null
        }
        Insert: {
          classification: Database["public"]["Enums"]["nps_classification"]
          comment?: string | null
          created_at?: string
          event_id?: string | null
          experience?: Database["public"]["Enums"]["nps_experience"] | null
          id?: string
          name?: string | null
          redirected_to_google?: boolean
          score?: number | null
          status?: Database["public"]["Enums"]["nps_status"]
          tenant_id?: string
          unit_id: string
          updated_at?: string
          wants_google_review?: boolean
          whatsapp?: string | null
        }
        Update: {
          classification?: Database["public"]["Enums"]["nps_classification"]
          comment?: string | null
          created_at?: string
          event_id?: string | null
          experience?: Database["public"]["Enums"]["nps_experience"] | null
          id?: string
          name?: string | null
          redirected_to_google?: boolean
          score?: number | null
          status?: Database["public"]["Enums"]["nps_status"]
          tenant_id?: string
          unit_id?: string
          updated_at?: string
          wants_google_review?: boolean
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          celebrant_age: number | null
          celebrant_birthdate: string | null
          celebrant_name: string | null
          client_id: string
          closed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          desired_date: string | null
          desired_slot: Database["public"]["Enums"]["event_slot"] | null
          estimated_value: number | null
          fbclid: string | null
          first_response_at: string | null
          form_id: string | null
          gclid: string | null
          guest_estimate: number | null
          id: string
          landing_page: string | null
          loss_reason: Database["public"]["Enums"]["loss_reason"] | null
          lost_from_stage:
            | Database["public"]["Enums"]["opportunity_stage"]
            | null
          notes: string | null
          nps_response_id: string | null
          owner_id: string | null
          pre_reserva_at: string | null
          pre_reserva_expires_at: string | null
          referrer: string | null
          source: Database["public"]["Enums"]["opportunity_source"] | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          stage_changed_at: string
          tenant_id: string
          unit_id: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          celebrant_age?: number | null
          celebrant_birthdate?: string | null
          celebrant_name?: string | null
          client_id: string
          closed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          desired_date?: string | null
          desired_slot?: Database["public"]["Enums"]["event_slot"] | null
          estimated_value?: number | null
          fbclid?: string | null
          first_response_at?: string | null
          form_id?: string | null
          gclid?: string | null
          guest_estimate?: number | null
          id?: string
          landing_page?: string | null
          loss_reason?: Database["public"]["Enums"]["loss_reason"] | null
          lost_from_stage?:
            | Database["public"]["Enums"]["opportunity_stage"]
            | null
          notes?: string | null
          nps_response_id?: string | null
          owner_id?: string | null
          pre_reserva_at?: string | null
          pre_reserva_expires_at?: string | null
          referrer?: string | null
          source?: Database["public"]["Enums"]["opportunity_source"] | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          stage_changed_at?: string
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          celebrant_age?: number | null
          celebrant_birthdate?: string | null
          celebrant_name?: string | null
          client_id?: string
          closed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          desired_date?: string | null
          desired_slot?: Database["public"]["Enums"]["event_slot"] | null
          estimated_value?: number | null
          fbclid?: string | null
          first_response_at?: string | null
          form_id?: string | null
          gclid?: string | null
          guest_estimate?: number | null
          id?: string
          landing_page?: string | null
          loss_reason?: Database["public"]["Enums"]["loss_reason"] | null
          lost_from_stage?:
            | Database["public"]["Enums"]["opportunity_stage"]
            | null
          notes?: string | null
          nps_response_id?: string | null
          owner_id?: string | null
          pre_reserva_at?: string | null
          pre_reserva_expires_at?: string | null
          referrer?: string | null
          source?: Database["public"]["Enums"]["opportunity_source"] | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          stage_changed_at?: string
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_nps_response_id_fkey"
            columns: ["nps_response_id"]
            isOneToOne: false
            referencedRelation: "nps_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
      units: {
        Row: {
          created_at: string
          google_reviews_url: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          nps_dinner_end: string
          nps_dinner_start: string
          nps_lunch_end: string
          nps_lunch_start: string
          public_review_token: string
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_reviews_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          nps_dinner_end?: string
          nps_dinner_start?: string
          nps_lunch_end?: string
          nps_lunch_start?: string
          public_review_token?: string
          slug: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_reviews_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          nps_dinner_end?: string
          nps_dinner_start?: string
          nps_lunch_end?: string
          nps_lunch_start?: string
          public_review_token?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_units: {
        Row: {
          unit_id: string
          user_id: string
        }
        Insert: {
          unit_id: string
          user_id: string
        }
        Update: {
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_role: string
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
          tenant_role?: string
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
          tenant_role?: string
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
      visits: {
        Row: {
          confirmed: boolean
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          opportunity_id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["visit_status"]
          tenant_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opportunity_id: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["visit_status"]
          tenant_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
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
      get_public_unit: {
        Args: { _slug: string }
        Returns: {
          google_reviews_url: string
          logo_url: string
          name: string
          unit_id: string
        }[]
      }
      mark_nps_google_redirect: {
        Args: { _response_id: string }
        Returns: undefined
      }
      submit_nps_response: {
        Args: {
          _comment: string
          _experience: string
          _name: string
          _score: number
          _slug: string
          _wants_budget: boolean
          _wants_google_review: boolean
          _whatsapp: string
        }
        Returns: {
          classification: Database["public"]["Enums"]["nps_classification"]
          response_id: string
        }[]
      }
    }
    Enums: {
      client_status: "lead" | "cliente"
      contract_status:
        | "rascunho"
        | "aguardando_assinaturas"
        | "assinado"
        | "cancelado"
      event_slot: "almoco" | "jantar"
      loss_reason:
        | "preco"
        | "data_indisponivel"
        | "sem_resposta"
        | "fechou_concorrente"
        | "festa_em_casa"
        | "fora_perfil"
        | "desistiu"
        | "outro"
      nps_classification: "detrator" | "neutro" | "promotor"
      nps_experience: "loved" | "ok" | "improve"
      nps_status: "novo" | "visto" | "resolvido"
      opportunity_source:
        | "meta"
        | "ga"
        | "indicacao"
        | "veio_em_festa"
        | "offline"
        | "ja_cliente"
        | "recorrencia"
        | "outro"
      opportunity_stage:
        | "em_conversa"
        | "visita_agendada"
        | "visita_realizada"
        | "pre_reserva"
        | "ganho"
        | "perdido"
      user_role: "vendedor" | "gestor" | "admin"
      visit_status:
        | "agendada"
        | "realizada"
        | "no_show"
        | "remarcada"
        | "cancelada"
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
      event_slot: ["almoco", "jantar"],
      loss_reason: [
        "preco",
        "data_indisponivel",
        "sem_resposta",
        "fechou_concorrente",
        "festa_em_casa",
        "fora_perfil",
        "desistiu",
        "outro",
      ],
      nps_classification: ["detrator", "neutro", "promotor"],
      nps_experience: ["loved", "ok", "improve"],
      nps_status: ["novo", "visto", "resolvido"],
      opportunity_source: [
        "meta",
        "ga",
        "indicacao",
        "veio_em_festa",
        "offline",
        "ja_cliente",
        "recorrencia",
        "outro",
      ],
      opportunity_stage: [
        "em_conversa",
        "visita_agendada",
        "visita_realizada",
        "pre_reserva",
        "ganho",
        "perdido",
      ],
      user_role: ["vendedor", "gestor", "admin"],
      visit_status: [
        "agendada",
        "realizada",
        "no_show",
        "remarcada",
        "cancelada",
      ],
    },
  },
} as const
