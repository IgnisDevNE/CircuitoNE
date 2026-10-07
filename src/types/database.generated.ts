
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "artist_profiles": {
                  Row: {
                    "kind": string,"profile_id": string
                  }
                  Insert: {
                    "kind"?: string,"profile_id": string
                  }
                  Update: {
                    "kind"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artist_profiles_profile_id_kind_fkey"
      columns: ["profile_id","kind"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","kind"]
    }
                  ]
                },"artist_styles": {
                  Row: {
                    "id": string,"profile_id": string,"style": string,"substyle": string | null
                  }
                  Insert: {
                    "id"?: string,"profile_id": string,"style": string,"substyle"?: string | null
                  }
                  Update: {
                    "id"?: string,"profile_id"?: string,"style"?: string,"substyle"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "artist_styles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "artist_profiles"
      referencedColumns: ["profile_id"]
    },{
      foreignKeyName: "artist_styles_style_fkey"
      columns: ["style"]
isOneToOne: false
      referencedRelation: "music_styles"
      referencedColumns: ["name"]
    },{
      foreignKeyName: "artist_styles_style_substyle_fkey"
      columns: ["style","substyle"]
isOneToOne: false
      referencedRelation: "music_substyles"
      referencedColumns: ["style","name"]
    }
                  ]
                },"collectives": {
                  Row: {
                    "activity": string,"city": string,"color": string | null,"created_at": string,"description": string,"id": string,"image_path": string | null,"kind": string,"member_role_builtin": boolean,"member_role_id": string,"name": string,"owner_user_id": string | null,"social_links": NonNullable<Json>,"state": string,"state_code": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "activity": string,"city": string,"color"?: string | null,"created_at"?: string,"description": string,"id"?: string,"image_path"?: string | null,"kind": string,"member_role_builtin"?: boolean,"member_role_id": string,"name": string,"owner_user_id"?: string | null,"social_links"?: NonNullable<Json>,"state"?: string,"state_code": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "activity"?: string,"city"?: string,"color"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"image_path"?: string | null,"kind"?: string,"member_role_builtin"?: boolean,"member_role_id"?: string,"name"?: string,"owner_user_id"?: string | null,"social_links"?: NonNullable<Json>,"state"?: string,"state_code"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"events": {
                  Row: {
                    "cancelled_at": string | null,"city": string,"collective_id": string,"cover_bytes": number | null,"cover_path": string | null,"cover_url": string | null,"created_at": string,"description": string,"ends_at": string | null,"first_published_at": string | null,"id": string,"is_free": boolean,"kind": string,"name": string,"other_kind": string | null,"previous_starts_at": string | null,"rescheduled_at": string | null,"starts_at": string,"state": string,"state_code": string,"style": string | null,"ticket_url": string | null,"timezone": string,"updated_at": string,"venue": string,"version": number
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"city": string,"collective_id": string,"cover_bytes"?: number | null,"cover_path"?: string | null,"cover_url"?: string | null,"created_at"?: string,"description"?: string,"ends_at"?: string | null,"first_published_at"?: string | null,"id"?: string,"is_free": boolean,"kind": string,"name": string,"other_kind"?: string | null,"previous_starts_at"?: string | null,"rescheduled_at"?: string | null,"starts_at": string,"state"?: string,"state_code": string,"style"?: string | null,"ticket_url"?: string | null,"timezone"?: string,"updated_at"?: string,"venue": string,"version"?: number
                  }
                  Update: {
                    "cancelled_at"?: string | null,"city"?: string,"collective_id"?: string,"cover_bytes"?: number | null,"cover_path"?: string | null,"cover_url"?: string | null,"created_at"?: string,"description"?: string,"ends_at"?: string | null,"first_published_at"?: string | null,"id"?: string,"is_free"?: boolean,"kind"?: string,"name"?: string,"other_kind"?: string | null,"previous_starts_at"?: string | null,"rescheduled_at"?: string | null,"starts_at"?: string,"state"?: string,"state_code"?: string,"style"?: string | null,"ticket_url"?: string | null,"timezone"?: string,"updated_at"?: string,"venue"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_collective_id_fkey"
      columns: ["collective_id"]
isOneToOne: false
      referencedRelation: "collectives"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_style_fkey"
      columns: ["style"]
isOneToOne: false
      referencedRelation: "music_styles"
      referencedColumns: ["name"]
    }
                  ]
                },"music_styles": {
                  Row: {
                    "name": string
                  }
                  Insert: {
                    "name": string
                  }
                  Update: {
                    "name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"music_substyles": {
                  Row: {
                    "name": string,"style": string
                  }
                  Insert: {
                    "name": string,"style": string
                  }
                  Update: {
                    "name"?: string,"style"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "music_substyles_style_fkey"
      columns: ["style"]
isOneToOne: false
      referencedRelation: "music_styles"
      referencedColumns: ["name"]
    }
                  ]
                },"professional_details": {
                  Row: {
                    "audiovisual_type": string | null,"booking_email": string | null,"cnpj": string | null,"contact_email": string | null,"contact_phone": string | null,"fee_cents": number | null,"kind": string,"portfolio_url": string | null,"presskit_bytes": number | null,"presskit_path": string | null,"presskit_url": string | null,"profile_id": string,"service_other": string | null,"service_type": string | null,"services_pdf_bytes": number | null,"services_pdf_path": string | null,"updated_at": string
                  }
                  Insert: {
                    "audiovisual_type"?: string | null,"booking_email"?: string | null,"cnpj"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"fee_cents"?: number | null,"kind": string,"portfolio_url"?: string | null,"presskit_bytes"?: number | null,"presskit_path"?: string | null,"presskit_url"?: string | null,"profile_id": string,"service_other"?: string | null,"service_type"?: string | null,"services_pdf_bytes"?: number | null,"services_pdf_path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "audiovisual_type"?: string | null,"booking_email"?: string | null,"cnpj"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"fee_cents"?: number | null,"kind"?: string,"portfolio_url"?: string | null,"presskit_bytes"?: number | null,"presskit_path"?: string | null,"presskit_url"?: string | null,"profile_id"?: string,"service_other"?: string | null,"service_type"?: string | null,"services_pdf_bytes"?: number | null,"services_pdf_path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "professional_details_profile_id_kind_fkey"
      columns: ["profile_id","kind"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","kind"]
    }
                  ]
                },"profile_images": {
                  Row: {
                    "alt_text": string,"id": string,"mime_type": string,"object_path": string,"position": number,"profile_id": string,"size_bytes": number
                  }
                  Insert: {
                    "alt_text"?: string,"id"?: string,"mime_type": string,"object_path": string,"position": number,"profile_id": string,"size_bytes": number
                  }
                  Update: {
                    "alt_text"?: string,"id"?: string,"mime_type"?: string,"object_path"?: string,"position"?: number,"profile_id"?: string,"size_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_images_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "artist_profiles"
      referencedColumns: ["profile_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "city": string,"color": string | null,"created_at": string,"description": string,"id": string,"kind": string,"name": string,"owner_id": string,"published": boolean,"social_links": NonNullable<Json>,"state_code": string,"updated_at": string
                  }
                  Insert: {
                    "city": string,"color"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"kind": string,"name": string,"owner_id": string,"published"?: boolean,"social_links"?: NonNullable<Json>,"state_code": string,"updated_at"?: string
                  }
                  Update: {
                    "city"?: string,"color"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"kind"?: string,"name"?: string,"owner_id"?: string,"published"?: boolean,"social_links"?: NonNullable<Json>,"state_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assign_collective_role":
{ Args: { "member": string,"target": string,"target_role": string }; Returns: undefined
                           },
"attach_profile_image":
{ Args: { "alt"?: string,"object_path": string,"slot": string,"target": string }; Returns: Json
                           },
"cancel_collective_request":
{ Args: { "target_request": string }; Returns: undefined
                           },
"cancel_event":
{ Args: { "expected_version": number,"target": string }; Returns: undefined
                           },
"claim_message_report":
{ Args: { "target": string }; Returns: undefined
                           },
"close_collective":
{ Args: { "reason": string,"target": string }; Returns: undefined
                           },
"close_message_report":
{ Args: { "resolution": string,"target": string }; Returns: undefined
                           },
"complete_registration":
{ Args: { "account": Json,"profile": Json,"request_id": string }; Returns: string
                           },
"create_collective":
{ Args: { "payload": Json,"request_id": string }; Returns: string
                           },
"create_event":
{ Args: { "collective": string,"payload": Json,"request_id": string }; Returns: string
                           },
"create_profile":
{ Args: { "payload": Json }; Returns: string
                           },
"decide_collective_request":
{ Args: { "approve": boolean,"target_request": string }; Returns: undefined
                           },
"delete_collective_role":
{ Args: { "target": string,"target_role": string }; Returns: undefined
                           },
"delete_profile":
{ Args: { "target": string }; Returns: undefined
                           },
"detach_profile_image":
{ Args: { "image": string,"target": string }; Returns: string
                           },
"edit_collective":
{ Args: { "expected_version": number,"payload": Json,"resubmit"?: boolean,"target": string }; Returns: undefined
                           },
"get_account_deletion_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_account_session":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_collective_access":
{ Args: { "target": string }; Returns: Json
                           },
"get_collective_member_activity":
{ Args: { "target": string }; Returns: {
              "last_activity_at": string,"user_id": string
            }[]
                           },
"get_collective_member_roster":
{ Args: { "target": string }; Returns: {
              "artist_name": string,"artist_profile_id": string,"is_owner": boolean,"last_activity_at": string,"member_name": string,"role_id": string,"role_name": string,"user_id": string
            }[]
                           },
"get_collective_members":
{ Args: { "target": string }; Returns: {
              "artist_profile_id": string,"name": string
            }[]
                           },
"get_collective_requests":
{ Args: { "target": string }; Returns: {
              "created_at": string,"id": string,"message": string,"profile_id": string,"state": string,"user_id": string
            }[]
                           },
"get_collective_review_contact":
{ Args: { "target": string }; Returns: Json
                           },
"get_collective_review_queue":
{ Args: { "after_id"?: string,"target_state"?: string }; Returns: {
              "city": string,"created_at": string,"id": string,"kind": string,"name": string,"state": string,"state_code": string,"version": number
            }[]
                           },
"get_collective_roles":
{ Args: { "target": string }; Returns: {
              "id": string,"name": string,"permissions": (string)[]
            }[]
                           },
"get_collective_status":
{ Args: { "target": string }; Returns: Json
                           },
"get_conversation_details":
{ Args: { "targets": (string)[] }; Returns: Json
                           },
"get_event":
{ Args: { "target": string }; Returns: Json
                           },
"get_message_report":
{ Args: { "target": string }; Returns: Json
                           },
"get_messages":
{ Args: { "after_id"?: string,"after_time"?: string,"target": string }; Returns: Json
                           },
"get_my_account_details":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_my_collective_requests":
{ Args: { "after_id"?: string }; Returns: {
              "collective_id": string,"created_at": string,"id": string,"state": string
            }[]
                           },
"get_my_profile":
{ Args: { "target": string }; Returns: Json
                           },
"get_profile":
{ Args: { "target": string }; Returns: Json
                           },
"get_recent_messages":
{ Args: { "before_id"?: string,"before_time"?: string,"target": string }; Returns: Json
                           },
"list_collective_events":
{ Args: { "after_id"?: string,"after_start"?: string,"period"?: string,"target": string }; Returns: Json
                           },
"list_collective_requests":
{ Args: { "target": string }; Returns: {
              "created_at": string,"id": string,"message": string,"profile_id": string,"profile_kind": string,"profile_name": string,"profile_published": boolean,"requester_name": string
            }[]
                           },
"list_conversations":
{ Args: { "after_id"?: string,"after_time"?: string }; Returns: Json
                           },
"list_events":
{ Args: { "after_id"?: string,"after_start"?: string,"artist"?: string,"period"?: string }; Returns: Json
                           },
"list_message_reports":
{ Args: { "after_id"?: string,"after_time"?: string }; Returns: Json
                           },
"list_my_collectives":
{ Args: Record<PropertyKey, never>; Returns: {
              "city": string,"id": string,"is_owner": boolean,"kind": string,"name": string,"role_name": string,"state": string,"state_code": string
            }[]
                           },
"list_my_profiles":
{ Args: Record<PropertyKey, never>; Returns: {
              "city": string,"id": string,"is_default": boolean,"kind": string,"name": string,"published": boolean,"state_code": string
            }[]
                           },
"mark_conversation_read":
{ Args: { "last_message": string,"target": string }; Returns: undefined
                           },
"move_profile_image":
{ Args: { "direction": string,"image": string,"target": string }; Returns: undefined
                           },
"publish_event":
{ Args: { "expected_version": number,"target": string }; Returns: undefined
                           },
"remove_collective_member":
{ Args: { "member": string,"target": string }; Returns: undefined
                           },
"report_message":
{ Args: { "reason": string,"target": string }; Returns: string
                           },
"request_account_deletion":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"request_collective_membership":
{ Args: { "message"?: string,"profile"?: string,"target": string }; Returns: string
                           },
"review_collective":
{ Args: { "decision": string,"expected_version": number,"reason": string,"target": string }; Returns: undefined
                           },
"save_collective_role":
{ Args: { "permissions": (string)[],"role_name": string,"target": string,"target_role": string }; Returns: string
                           },
"send_message":
{ Args: { "body": string,"recipient": string,"recipient_kind": string,"request_id": string,"sender": string,"sender_kind": string }; Returns: Json
                           },
"set_collective_image":
{ Args: { "object_path": string,"target": string }; Returns: string
                           },
"set_conversation_block":
{ Args: { "as_id": string,"as_kind": string,"blocked": boolean,"target": string }; Returns: undefined
                           },
"set_default_artist":
{ Args: { "target": string }; Returns: undefined
                           },
"set_professional_document":
{ Args: { "kind": string,"object_path": string,"target": string }; Returns: string
                           },
"support_close_collective":
{ Args: { "reason": string,"target": string }; Returns: undefined
                           },
"transfer_collective_ownership":
{ Args: { "successor": string,"target": string }; Returns: undefined
                           },
"update_event":
{ Args: { "expected_version": number,"payload": Json,"target": string }; Returns: undefined
                           },
"update_my_account_details":
{ Args: { "payload": Json }; Returns: undefined
                           },
"update_my_professional_details":
{ Args: { "payload": Json,"target": string }; Returns: undefined
                           },
"update_my_profile":
{ Args: { "payload": Json,"target": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

