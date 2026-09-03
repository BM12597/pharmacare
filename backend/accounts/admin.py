"""Minimal registration for now. The full account-issuing portal is next."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["user_id"]
    list_display = ["user_id", "full_name", "role", "is_active"]
    list_filter = ["role", "is_active"]
    search_fields = ["user_id", "full_name"]

    fieldsets = [
        (None, {"fields": ["user_id", "password"]}),
        ("Person", {"fields": ["full_name", "role", "facility", "email", "phone",
                               "registration_number"]}),
        ("Access", {"fields": ["is_active", "must_change_password", "is_staff",
                               "is_superuser", "groups", "user_permissions"]}),
        ("History", {"fields": ["last_login", "date_joined", "created_by"]}),
    ]

    add_fieldsets = [
        (None, {
            "classes": ["wide"],
            "fields": ["user_id", "full_name", "role", "password1", "password2"],
        }),
    ]
